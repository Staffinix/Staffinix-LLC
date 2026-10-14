"""enforce membership and question uniqueness

Revision ID: 7c3d4e5f6a7b
Revises: 150e786a2fea
Create Date: 2026-10-14
"""
from typing import Sequence, Union

from alembic import op


revision: str = "7c3d4e5f6a7b"
down_revision: Union[str, None] = "150e786a2fea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("uq_memberships_auth_user_id", "memberships", ["auth_user_id"], unique=True)
    op.create_index(
        "uq_questions_template_position",
        "questions",
        ["template_id", "position"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_questions_template_position", table_name="questions")
    op.drop_index("uq_memberships_auth_user_id", table_name="memberships")
