"""
FastAPI dependencies for authentication and role-based access control.
"""
from typing import Annotated

from fastapi import Depends, HTTPException, status
# from fastapi.security import OAuth2PasswordBearer
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.enums import WorkspaceRole
from app.models.workspace import WorkspaceMember

# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
security = HTTPBearer()

# ---------------------------------------------------------------------------
# Current-user dependency
# ---------------------------------------------------------------------------
async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials,
        Depends(security)
    ],
    db: Session = Depends(get_db),
) -> User:
    """Decode the JWT access token and return the corresponding User.

    Raises 401 if the token is invalid, expired, or not an access token,
    or if the user no longer exists.
    """
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Ensure the authenticated user account is still active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )
    return current_user


# ---------------------------------------------------------------------------
# Role-based access control
# ---------------------------------------------------------------------------
class RoleChecker:
    """Dependency that verifies the current user holds one of the allowed
    roles **within a specific workspace**.

    Usage in a route::

        @router.get("/workspaces/{workspace_id}/settings")
        def ws_settings(
            workspace_id: int,
            user: User = Depends(get_current_active_user),
            _: bool = Depends(RoleChecker([WorkspaceRole.OWNER])),
        ):
            ...

    The ``workspace_id`` path parameter is resolved automatically from the
    request, so routes using this dependency **must** include it.
    """

    def __init__(self, allowed_roles: list[WorkspaceRole]):
        self.allowed_roles = allowed_roles

    def __call__(
        self,
        workspace_id: int,
        current_user: Annotated[User, Depends(get_current_active_user)],
        db: Session = Depends(get_db),
    ) -> bool:
        membership = (
            db.query(WorkspaceMember)
            .filter(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == current_user.id,
            )
            .first()
        )
        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace",
            )
        if membership.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{membership.role.value}' is not permitted. "
                       f"Required: {[r.value for r in self.allowed_roles]}",
            )
        return True


# ---------------------------------------------------------------------------
# Convenience shortcuts (for use in Depends())
# ---------------------------------------------------------------------------
require_owner = RoleChecker([WorkspaceRole.OWNER])
require_editor_or_above = RoleChecker([WorkspaceRole.OWNER, WorkspaceRole.EDITOR])
require_viewer_or_above = RoleChecker(
    [WorkspaceRole.OWNER, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER]
)
