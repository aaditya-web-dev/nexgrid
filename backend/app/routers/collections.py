"""
Collections and Folders router.

Endpoints
---------
POST   /api/workspaces/{workspace_id}/collections           create collection
GET    /api/workspaces/{workspace_id}/collections           list collections in workspace
GET    /api/collections/{collection_id}                     get one collection
PATCH  /api/collections/{collection_id}                     update collection
DELETE /api/collections/{collection_id}                     delete collection

POST   /api/collections/{collection_id}/folders             create folder
GET    /api/collections/{collection_id}/folders             list root folders
GET    /api/folders/{folder_id}                             get one folder
PATCH  /api/folders/{folder_id}                             update folder
DELETE /api/folders/{folder_id}                             delete folder
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.models.collection import Collection, Folder
from app.schemas.collection import (
    CollectionCreate,
    CollectionUpdate,
    CollectionResponse,
    FolderCreate,
    FolderUpdate,
    FolderResponse,
)

router = APIRouter(tags=["collections & folders"])

CurrentUser = Annotated[User, Depends(get_current_active_user)]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_workspace_or_404(workspace_id: int, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


def assert_member(workspace_id: int, user: User, db: Session) -> WorkspaceMember:
    """Raises 403 if the user is not a member of the workspace."""
    m = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
        .first()
    )
    if not m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace",
        )
    return m


def get_collection_or_404(collection_id: int, db: Session) -> Collection:
    c = db.query(Collection).filter(Collection.id == collection_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    return c


def get_folder_or_404(folder_id: int, db: Session) -> Folder:
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Folder not found")
    return f


# ===========================================================================
# Collection endpoints
# ===========================================================================

@router.post(
    "/api/workspaces/{workspace_id}/collections",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a collection inside a workspace",
)
def create_collection(
    workspace_id: int,
    payload: CollectionCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Any workspace member (editor or above) can create a collection."""
    get_workspace_or_404(workspace_id, db)
    assert_member(workspace_id, current_user, db)

    col = Collection(
        workspace_id=workspace_id,
        name=payload.name,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


@router.get(
    "/api/workspaces/{workspace_id}/collections",
    response_model=list[CollectionResponse],
    summary="List all collections in a workspace",
)
def list_collections(
    workspace_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    get_workspace_or_404(workspace_id, db)
    assert_member(workspace_id, current_user, db)
    return (
        db.query(Collection)
        .filter(Collection.workspace_id == workspace_id)
        .all()
    )


@router.get(
    "/api/collections/{collection_id}",
    response_model=CollectionResponse,
    summary="Get a single collection",
)
def get_collection(
    collection_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    col = get_collection_or_404(collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    return col


@router.patch(
    "/api/collections/{collection_id}",
    response_model=CollectionResponse,
    summary="Update a collection's name or description",
)
def update_collection(
    collection_id: int,
    payload: CollectionUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    col = get_collection_or_404(collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    if payload.name is not None:
        col.name = payload.name
    if payload.description is not None:
        col.description = payload.description

    db.commit()
    db.refresh(col)
    return col


@router.delete(
    "/api/collections/{collection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a collection (and all its folders/requests)",
)
def delete_collection(
    collection_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    col = get_collection_or_404(collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    db.delete(col)
    db.commit()


# ===========================================================================
# Folder endpoints
# ===========================================================================

@router.post(
    "/api/collections/{collection_id}/folders",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a folder inside a collection",
)
def create_folder(
    collection_id: int,
    payload: FolderCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Set ``parent_folder_id`` to nest the folder inside another folder.
    Leave it null to create a root-level folder.
    """
    col = get_collection_or_404(collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    # If a parent is specified, make sure it belongs to the same collection
    if payload.parent_folder_id is not None:
        parent = get_folder_or_404(payload.parent_folder_id, db)
        if parent.collection_id != collection_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent folder does not belong to this collection",
            )

    folder = Folder(
        collection_id=collection_id,
        parent_folder_id=payload.parent_folder_id,
        name=payload.name,
        position=payload.position,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.get(
    "/api/collections/{collection_id}/folders",
    response_model=list[FolderResponse],
    summary="List root-level folders in a collection",
)
def list_folders(
    collection_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Returns only top-level (root) folders. Use GET /api/folders/{id} to
    inspect children of a specific folder."""
    col = get_collection_or_404(collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    return (
        db.query(Folder)
        .filter(
            Folder.collection_id == collection_id,
            Folder.parent_folder_id.is_(None),   # root folders only
        )
        .order_by(Folder.position)
        .all()
    )


@router.get(
    "/api/folders/{folder_id}",
    response_model=FolderResponse,
    summary="Get a single folder",
)
def get_folder(
    folder_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    folder = get_folder_or_404(folder_id, db)
    col = get_collection_or_404(folder.collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    return folder


@router.patch(
    "/api/folders/{folder_id}",
    response_model=FolderResponse,
    summary="Update a folder's name, parent, or position",
)
def update_folder(
    folder_id: int,
    payload: FolderUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    folder = get_folder_or_404(folder_id, db)
    col = get_collection_or_404(folder.collection_id, db)
    assert_member(col.workspace_id, current_user, db)

    if payload.name is not None:
        folder.name = payload.name
    if payload.position is not None:
        folder.position = payload.position
    if payload.parent_folder_id is not None:
        # Validate new parent belongs to the same collection
        parent = get_folder_or_404(payload.parent_folder_id, db)
        if parent.collection_id != folder.collection_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New parent folder does not belong to the same collection",
            )
        # Prevent setting itself as its own parent
        if payload.parent_folder_id == folder_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A folder cannot be its own parent",
            )
        folder.parent_folder_id = payload.parent_folder_id

    db.commit()
    db.refresh(folder)
    return folder


@router.delete(
    "/api/folders/{folder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a folder (and all nested sub-folders)",
)
def delete_folder(
    folder_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    folder = get_folder_or_404(folder_id, db)
    col = get_collection_or_404(folder.collection_id, db)
    assert_member(col.workspace_id, current_user, db)
    db.delete(folder)
    db.commit()
