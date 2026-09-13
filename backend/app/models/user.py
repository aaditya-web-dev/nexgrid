"""
Minimal User model — just enough to prove the DB layer works end-to-end
in Week 1. Will be expanded in Week 3 (Auth Module) with password hashing,
roles, timestamps, etc.
"""
from sqlalchemy import Column, Integer, String

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
