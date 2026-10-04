"""
Workspace router — CRUD for workspaces + member management.

Endpoints
---------
POST   /api/workspaces                          create workspace
GET    /api/workspaces                          list my workspaces
GET    /api/workspaces/{workspace_id}           get one workspace
PATCH  /api/workspaces/{workspace_id}           update workspace (owner only)
DELETE /api/workspaces/{workspace_id}           delete workspace (owner only)

POST   /api/workspaces/{workspace_id}/members               invite member
GET    /api/workspaces/{workspace_id}/members               list members
PATCH  /api/workspaces/{workspace_id}/members/{user_id}     change role (owner only)
DELETE /api/workspaces/{workspace_id}/members/{user_id}     remove member (owner only)
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_owner
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.models.enums import WorkspaceRole
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceUpdate,
    WorkspaceResponse,
    MemberInvite,
    MemberRoleUpdate,
    MemberResponse,
)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

# Shorthand type alias used in every protected route
CurrentUser = Annotated[User, Depends(get_current_active_user)]


# ---------------------------------------------------------------------------
# Helper — fetch workspace or raise 404
# ---------------------------------------------------------------------------
def get_workspace_or_404(workspace_id: int, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


# ---------------------------------------------------------------------------
# Helper — verify the requesting user is the workspace owner
# ---------------------------------------------------------------------------
def assert_owner(workspace: Workspace, user: User) -> None:
    if workspace.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the workspace owner can perform this action",
        )


# ---------------------------------------------------------------------------
# Helper — fetch membership or raise 404
# ---------------------------------------------------------------------------
def get_member_or_404(workspace_id: int, user_id: int, db: Session) -> WorkspaceMember:
    m = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Member not found in this workspace")
    return m


# ===========================================================================
# Workspace CRUD
# ===========================================================================

@router.post(
    "",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
)
def create_workspace(
    payload: WorkspaceCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Creates a workspace and automatically adds the creator as OWNER."""
    ws = Workspace(
        name=payload.name,
        description=payload.description,
        owner_id=current_user.id,
    )
    db.add(ws)
    db.flush()  # get ws.id before committing

    # Add creator as OWNER member
    membership = WorkspaceMember(
        workspace_id=ws.id,
        user_id=current_user.id,
        role=WorkspaceRole.OWNER,
    )
    db.add(membership)
    db.commit()
    db.refresh(ws)
    return ws


@router.get(
    "",
    response_model=list[WorkspaceResponse],
    summary="List workspaces I belong to",
)
def list_workspaces(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Returns all workspaces the authenticated user is a member of."""
    memberships = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.user_id == current_user.id)
        .all()
    )
    workspace_ids = [m.workspace_id for m in memberships]
    return db.query(Workspace).filter(Workspace.id.in_(workspace_ids)).all()


@router.get(
    "/{workspace_id}",
    response_model=WorkspaceResponse,
    summary="Get a single workspace",
)
def get_workspace(
    workspace_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Any member of the workspace can view it."""
    ws = get_workspace_or_404(workspace_id, db)
    # Verify requesting user is a member
    get_member_or_404(workspace_id, current_user.id, db)
    return ws


@router.patch(
    "/{workspace_id}",
    response_model=WorkspaceResponse,
    summary="Update workspace name / description (owner only)",
)
def update_workspace(
    workspace_id: int,
    payload: WorkspaceUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    ws = get_workspace_or_404(workspace_id, db)
    assert_owner(ws, current_user)

    if payload.name is not None:
        ws.name = payload.name
    if payload.description is not None:
        ws.description = payload.description

    db.commit()
    db.refresh(ws)
    return ws


@router.delete(
    "/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a workspace (owner only)",
)
def delete_workspace(
    workspace_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    ws = get_workspace_or_404(workspace_id, db)
    assert_owner(ws, current_user)
    db.delete(ws)
    db.commit()


# ===========================================================================
# Member management
# ===========================================================================

@router.post(
    "/{workspace_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a user to the workspace (owner only)",
)
def invite_member(
    workspace_id: int,
    payload: MemberInvite,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    ws = get_workspace_or_404(workspace_id, db)
    assert_owner(ws, current_user)

    # Make sure the target user actually exists
    target = db.query(User).filter(User.id == payload.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent duplicate membership
    existing = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == payload.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this workspace",
        )

    # Prevent inviting with OWNER role (owner is set at creation only)
    if payload.role == WorkspaceRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot invite a user as OWNER. Transfer ownership instead.",
        )

    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=payload.user_id,
        role=payload.role,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get(
    "/{workspace_id}/members",
    response_model=list[MemberResponse],
    summary="List all members of a workspace",
)
def list_members(
    workspace_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    get_workspace_or_404(workspace_id, db)
    # Must be a member yourself to see the list
    get_member_or_404(workspace_id, current_user.id, db)
    return (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id)
        .all()
    )


@router.patch(
    "/{workspace_id}/members/{user_id}",
    response_model=MemberResponse,
    summary="Change a member's role (owner only)",
)
def update_member_role(
    workspace_id: int,
    user_id: int,
    payload: MemberRoleUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    ws = get_workspace_or_404(workspace_id, db)
    assert_owner(ws, current_user)

    if payload.role == WorkspaceRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign OWNER role this way. Transfer ownership instead.",
        )

    member = get_member_or_404(workspace_id, user_id, db)

    # Owner cannot demote themselves
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role",
        )

    member.role = payload.role
    db.commit()
    db.refresh(member)
    return member


@router.delete(
    "/{workspace_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member from the workspace (owner only)",
)
def remove_member(
    workspace_id: int,
    user_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    ws = get_workspace_or_404(workspace_id, db)
    assert_owner(ws, current_user)

    # Owner cannot remove themselves
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace owner cannot remove themselves",
        )

    member = get_member_or_404(workspace_id, user_id, db)
    db.delete(member)
    db.commit()
