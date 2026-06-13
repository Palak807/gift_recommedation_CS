from ...models.state import PipelineState
from ...models.contact import ContactProfile


async def ingest_node(state: PipelineState) -> dict:
    """Validate and normalise the incoming contact profile."""
    contact: ContactProfile = state["contact"]

    warnings = []
    if not contact.linkedin_data.skills and not contact.linkedin_data.recent_posts:
        warnings.append("Sparse LinkedIn data — signals may be weak")

    if contact.constraints.budget_max <= 0:
        raise ValueError("budget_max must be positive")

    return {"pipeline_warnings": warnings}
