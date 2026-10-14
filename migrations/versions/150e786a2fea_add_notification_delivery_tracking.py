"""add notification delivery tracking

Revision ID: 150e786a2fea
Revises: 0d3eee8b5311
Create Date: 2026-10-14 16:58:44.958970
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '150e786a2fea'
down_revision: Union[str, None] = '0d3eee8b5311'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('company_id', sa.String(length=36), nullable=False),
        sa.Column('candidate_id', sa.String(length=36), nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('recipient', sa.String(length=320), nullable=False),
        sa.Column('template', sa.String(length=80), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('provider_message_id', sa.String(length=160), nullable=True),
        sa.Column('error', sa.String(length=500), nullable=True),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['candidate_id'], ['candidates.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_candidate_id'), 'notifications', ['candidate_id'])
    op.create_index(op.f('ix_notifications_company_id'), 'notifications', ['company_id'])
    op.create_index(op.f('ix_notifications_status'), 'notifications', ['status'])

def downgrade() -> None:
    op.drop_index(op.f('ix_notifications_status'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_company_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_candidate_id'), table_name='notifications')
    op.drop_table('notifications')
