"""
Environments router — CRUD for environments and their variables.

Endpoints
---------
POST   /api/workspaces/{workspace_id}/environments              create environment
GET    /api/workspaces/{workspace_id}/environments              list environments
GET    /api/environments/{environment_id}                       get one (with variables)
PATCH  /api/environments/{environment_id}                       update environment
DELETE /api/environments/{environment_id}                       delete environment

POST   /api/environments/{environment_id}/variables             add variable
GET    /api/environments/{environment_id}/variables             list variables
PATCH  /api/variables/{variable_id}                             update variable
DELETE /api/variables/{variable_id}                             delete variable
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.models.environment import Environment, EnvironmentVariable
from app.schemas.environment import (
    EnvironmentCreate,
    EnvironmentUpdate,
    EnvironmentResponse,
    EnvironmentWithVariablesResponse,
    VariableCreate,
    VariableUpdate,
    VariableResponse,
)

router = APIRouter(tags=["environments"])

CurrentUser = Annotated[User, Depends(get_current_active_user)]

SECRET_MASK = "***"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_workspace_or_404(workspace_id: int, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


def assert_member(workspace_id: int, user: User, db: Session) -> None:
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


def get_environment_or_404(environment_id: int, db: Session) -> Environment:
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


def get_variable_or_404(variable_id: int, db: Session) -> EnvironmentVariable:
    var = db.query(EnvironmentVariable).filter(EnvironmentVariable.id == variable_id).first()
    if not var:
        raise HTTPException(status_code=404, detail="Variable not found")
    return var


def mask_variable(var: EnvironmentVariable) -> VariableResponse:
    """Build a VariableResponse, masking the value if is_secret=True."""
    return VariableResponse(
        id=var.id,
        environment_id=var.environment_id,
        key=var.key,
        value=SECRET_MASK if var.is_secret else var.value,
        is_secret=var.is_secret,
        created_at=var.created_at,
        updated_at=var.updated_at,
    )


def _clear_other_defaults(workspace_id: int, exclude_id: int, db: Session) -> None:
    """When setting an environment as default, unset all others in the workspace."""
    db.query(Environment).filter(
        Environment.workspace_id == workspace_id,
        Environment.id != exclude_id,
        Environment.is_default == True,  # noqa: E712
    ).update({"is_default": False})


# ===========================================================================
# Environment endpoints
# ===========================================================================

@router.post(
    "/api/workspaces/{workspace_id}/environments",
    response_model=EnvironmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an environment in a workspace",
)
def create_environment(
    workspace_id: int,
    payload: EnvironmentCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Creates a new environment (e.g. 'development', 'staging', 'production').
    If ``is_default=True``, all other environments in the workspace are
    automatically unset as default.
    """
    get_workspace_or_404(workspace_id, db)
    assert_member(workspace_id, current_user, db)

    # Check unique name within workspace
    existing = (
        db.query(Environment)
        .filter(
            Environment.workspace_id == workspace_id,
            Environment.name == payload.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An environment named '{payload.name}' already exists in this workspace",
        )

    env = Environment(
        workspace_id=workspace_id,
        name=payload.name,
        is_default=payload.is_default,
        created_by=current_user.id,
    )
    db.add(env)
    db.flush()  # get env.id

    if payload.is_default:
        _clear_other_defaults(workspace_id, env.id, db)

    db.commit()
    db.refresh(env)
    return env


@router.get(
    "/api/workspaces/{workspace_id}/environments",
    response_model=list[EnvironmentResponse],
    summary="List environments in a workspace",
)
def list_environments(
    workspace_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    get_workspace_or_404(workspace_id, db)
    assert_member(workspace_id, current_user, db)
    return (
        db.query(Environment)
        .filter(Environment.workspace_id == workspace_id)
        .order_by(Environment.name)
        .all()
    )


@router.get(
    "/api/environments/{environment_id}",
    response_model=EnvironmentWithVariablesResponse,
    summary="Get an environment with all its variables",
)
def get_environment(
    environment_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Secret variable values are masked as '***' in this response."""
    env = get_environment_or_404(environment_id, db)
    assert_member(env.workspace_id, current_user, db)

    masked_vars = [mask_variable(v) for v in env.variables]

    return EnvironmentWithVariablesResponse(
        id=env.id,
        workspace_id=env.workspace_id,
        name=env.name,
        is_default=env.is_default,
        created_by=env.created_by,
        created_at=env.created_at,
        updated_at=env.updated_at,
        variables=masked_vars,
    )


@router.patch(
    "/api/environments/{environment_id}",
    response_model=EnvironmentResponse,
    summary="Rename or toggle default for an environment",
)
def update_environment(
    environment_id: int,
    payload: EnvironmentUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    env = get_environment_or_404(environment_id, db)
    assert_member(env.workspace_id, current_user, db)

    if payload.name is not None:
        # Check name uniqueness before applying
        clash = (
            db.query(Environment)
            .filter(
                Environment.workspace_id == env.workspace_id,
                Environment.name == payload.name,
                Environment.id != environment_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An environment named '{payload.name}' already exists",
            )
        env.name = payload.name

    if payload.is_default is not None:
        env.is_default = payload.is_default
        if payload.is_default:
            _clear_other_defaults(env.workspace_id, environment_id, db)

    db.commit()
    db.refresh(env)
    return env


@router.delete(
    "/api/environments/{environment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an environment and all its variables",
)
def delete_environment(
    environment_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    env = get_environment_or_404(environment_id, db)
    assert_member(env.workspace_id, current_user, db)
    db.delete(env)
    db.commit()


# ===========================================================================
# Variable endpoints
# ===========================================================================

@router.post(
    "/api/environments/{environment_id}/variables",
    response_model=VariableResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a variable to an environment",
)
def create_variable(
    environment_id: int,
    payload: VariableCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Keys must be unique within an environment.
    Mark ``is_secret=true`` for tokens/passwords — the value will be
    masked in all GET responses.
    """
    env = get_environment_or_404(environment_id, db)
    assert_member(env.workspace_id, current_user, db)

    # Enforce unique key within the environment
    existing = (
        db.query(EnvironmentVariable)
        .filter(
            EnvironmentVariable.environment_id == environment_id,
            EnvironmentVariable.key == payload.key,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Variable '{payload.key}' already exists in this environment",
        )

    var = EnvironmentVariable(
        environment_id=environment_id,
        key=payload.key,
        value=payload.value,
        is_secret=payload.is_secret,
    )
    db.add(var)
    db.commit()
    db.refresh(var)
    return mask_variable(var)


@router.get(
    "/api/environments/{environment_id}/variables",
    response_model=list[VariableResponse],
    summary="List all variables in an environment",
)
def list_variables(
    environment_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Secret values are masked as '***'."""
    env = get_environment_or_404(environment_id, db)
    assert_member(env.workspace_id, current_user, db)
    return [mask_variable(v) for v in env.variables]


@router.patch(
    "/api/variables/{variable_id}",
    response_model=VariableResponse,
    summary="Update a variable's key, value, or secret flag",
)
def update_variable(
    variable_id: int,
    payload: VariableUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    var = get_variable_or_404(variable_id, db)
    env = get_environment_or_404(var.environment_id, db)
    assert_member(env.workspace_id, current_user, db)

    if payload.key is not None:
        # Ensure new key doesn't clash with another variable in the same env
        clash = (
            db.query(EnvironmentVariable)
            .filter(
                EnvironmentVariable.environment_id == var.environment_id,
                EnvironmentVariable.key == payload.key,
                EnvironmentVariable.id != variable_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Variable '{payload.key}' already exists in this environment",
            )
        var.key = payload.key

    if payload.value is not None:
        var.value = payload.value
    if payload.is_secret is not None:
        var.is_secret = payload.is_secret

    db.commit()
    db.refresh(var)
    return mask_variable(var)


@router.delete(
    "/api/variables/{variable_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a variable",
)
def delete_variable(
    variable_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    var = get_variable_or_404(variable_id, db)
    env = get_environment_or_404(var.environment_id, db)
    assert_member(env.workspace_id, current_user, db)
    db.delete(var)
    db.commit()
