"""
Pydantic schemas for authentication endpoints (register, login, tokens).
"""
from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class UserRegister(BaseModel):
    """POST /api/auth/register request body."""
    username: str = Field(..., min_length=3, max_length=50, examples=["ashok"])
    email: EmailStr = Field(..., examples=["ashok@nexgrid.dev"])
    full_name: str | None = Field(None, max_length=120, examples=["Ashok Kumar"])
    password: str = Field(..., min_length=8, max_length=128, examples=["S3cureP@ss!"])


class UserLogin(BaseModel):
    """POST /api/auth/login request body."""
    username: str = Field(..., examples=["ashok"])
    password: str = Field(..., examples=["S3cureP@ss!"])


class RefreshTokenRequest(BaseModel):
    """POST /api/auth/refresh request body."""
    refresh_token: str


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class TokenResponse(BaseModel):
    """Returned after successful login or token refresh."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Public user representation (never exposes hashed_password)."""
    id: int
    username: str
    email: str
    full_name: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    """Generic message envelope."""
    message: str
