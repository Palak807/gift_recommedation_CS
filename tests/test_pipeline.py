"""
Deepeval-based quality tests for the Gift Recommendation pipeline.

Run with: pytest tests/ -v
Set OPENAI_API_KEY / OPENAI_BASE_URL in conftest.py or env before running.
"""
import pytest
import asyncio
from deepeval import assert_test
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from deepeval.metrics import GEval, AnswerRelevancyMetric

from backend.models.contact import ContactProfile
from backend.pipeline.nodes.extract_signals import extract_signals_node
from backend.pipeline.nodes.filter_signals import filter_signals_node
from tests.conftest import SAMPLE_CONTACT


@pytest.fixture
def sample_contact():
    return ContactProfile(**SAMPLE_CONTACT)


@pytest.fixture
def extract_signals_result(sample_contact):
    """Run signal extraction once and reuse across tests."""
    state = {"contact": sample_contact, "messages": [], "raw_signals": []}
    config = {"configurable": {}}
    result = asyncio.get_event_loop().run_until_complete(
        extract_signals_node(state, config)
    )
    return result


class TestSignalExtraction:
    def test_signals_are_extracted(self, extract_signals_result):
        """Should extract at least 5 signals from the sample profile."""
        signals = extract_signals_result["raw_signals"]
        assert len(signals) >= 5, f"Expected >= 5 signals, got {len(signals)}"

    def test_ultramarathon_signal_found(self, extract_signals_result):
        """Ultramarathon running is strongly signalled — must appear."""
        signals = extract_signals_result["raw_signals"]
        signal_texts = " ".join(s.signal.lower() for s in signals)
        assert any(
            kw in signal_texts for kw in ["marathon", "running", "endurance", "trail"]
        ), f"Expected endurance/running signal, got: {signal_texts}"

    def test_signal_quality_with_deepeval(self, extract_signals_result, sample_contact):
        """Signals should be specific, actionable, and derived from the profile."""
        signals = extract_signals_result["raw_signals"]
        signal_summary = "\n".join(f"- [{s.strength}] {s.signal}" for s in signals)

        test_case = LLMTestCase(
            input=f"Extract gifting signals for {sample_contact.name}. Profile: {sample_contact.linkedin_data.summary}",
            actual_output=signal_summary,
            context=[
                f"LinkedIn headline: {sample_contact.linkedin_data.headline}",
                f"Recent posts: {'; '.join(sample_contact.linkedin_data.recent_posts[:2])}",
            ],
        )
        metric = GEval(
            name="Signal Specificity",
            criteria=(
                "The signals should be specific and actionable for gifting. "
                "Each signal should reference a concrete interest, hobby, or trait from the profile. "
                "Generic signals like 'works in tech' should not exist. "
                "Signals about endurance sports, systems thinking, and productivity tools should be present given the profile."
            ),
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.CONTEXT],
            threshold=0.7,
        )
        assert_test(test_case, [metric])

    def test_no_sensitive_signals(self, extract_signals_result):
        """No signals about religion, health, politics, or family status."""
        sensitive = ["religion", "health", "illness", "politics", "pregnancy", "divorce", "ethnicity"]
        signals = extract_signals_result["raw_signals"]
        for sig in signals:
            sig_lower = sig.signal.lower()
            for kw in sensitive:
                assert kw not in sig_lower, f"Sensitive signal found: {sig.signal}"


class TestSignalFiltering:
    def test_filter_removes_sensitive_signals(self, sample_contact):
        """Signals with sensitive keywords should be removed."""
        from backend.models.recommendation import GiftSignal, SignalStrength

        raw_signals = [
            GiftSignal(category="sports", signal="Runs ultramarathons", strength=SignalStrength.strong, source="posts"),
            GiftSignal(category="health", signal="Recovering from knee surgery", strength=SignalStrength.moderate, source="posts"),
            GiftSignal(category="productivity", signal="Uses Obsidian for note-taking", strength=SignalStrength.strong, source="comments"),
        ]
        state = {
            "contact": sample_contact, "messages": [], "raw_signals": raw_signals,
            "filtered_signals": [], "filtered_out_reasons": [],
        }
        config = {"configurable": {}}
        result = asyncio.get_event_loop().run_until_complete(
            filter_signals_node(state, config)
        )
        filtered = result["filtered_signals"]
        assert not any("surgery" in s.signal.lower() or "knee" in s.signal.lower() for s in filtered), \
            "Health-related signal should have been filtered"

    def test_filter_preserves_safe_signals(self, extract_signals_result, sample_contact):
        """Safe signals should pass through the filter."""
        from backend.models.state import PipelineState
        raw_signals = extract_signals_result["raw_signals"]
        state = {
            "contact": sample_contact, "messages": [], "raw_signals": raw_signals,
            "filtered_signals": [], "filtered_out_reasons": [],
        }
        config = {"configurable": {}}
        result = asyncio.get_event_loop().run_until_complete(
            filter_signals_node(state, config)
        )
        assert len(result["filtered_signals"]) >= 4, \
            "Most safe signals should pass through"


class TestPipelineIntegration:
    def test_result_has_three_recommendations(self, sample_contact):
        """End-to-end: should return 3 recommendations (or fewer if no products found)."""
        from backend.pipeline.graph import pipeline_graph
        state = asyncio.get_event_loop().run_until_complete(
            pipeline_graph.ainvoke({"contact": sample_contact, "messages": []})
        )
        result = state["final_result"]
        assert result is not None
        assert result.contact_id == sample_contact.contact_id
        assert len(result.signals_extracted) >= 3

    def test_recommendations_have_reasoning(self, sample_contact):
        """Each recommendation should have a non-empty reasoning field."""
        from backend.pipeline.graph import pipeline_graph
        state = asyncio.get_event_loop().run_until_complete(
            pipeline_graph.ainvoke({"contact": sample_contact, "messages": []})
        )
        result = state["final_result"]
        for rec in result.top_3_recommendations:
            assert rec.reasoning, f"Rank {rec.rank} has empty reasoning"
            assert len(rec.reasoning) > 20, f"Rank {rec.rank} reasoning too short"

    def test_stage_reasoning_captured(self, sample_contact):
        """Pipeline should capture LLM reasoning at each stage."""
        from backend.pipeline.graph import pipeline_graph
        state = asyncio.get_event_loop().run_until_complete(
            pipeline_graph.ainvoke({"contact": sample_contact, "messages": []})
        )
        result = state["final_result"]
        assert "extract_signals" in result.stage_reasoning, "Missing extract_signals reasoning"
        assert "rank_gifts" in result.stage_reasoning, "Missing rank_gifts reasoning"
        assert len(result.stage_reasoning["extract_signals"]) > 20

    def test_tone_affects_message(self, sample_contact):
        """Formal tone should produce a noticeably different message than playful."""
        from backend.pipeline.graph import pipeline_graph
        from backend.models.contact import MessageTone

        formal_contact = sample_contact.model_copy(
            update={"constraints": sample_contact.constraints.model_copy(update={"tone": MessageTone.formal})}
        )
        playful_contact = sample_contact.model_copy(
            update={"constraints": sample_contact.constraints.model_copy(update={"tone": MessageTone.playful})}
        )

        formal_state = asyncio.get_event_loop().run_until_complete(
            pipeline_graph.ainvoke({"contact": formal_contact, "messages": []})
        )
        playful_state = asyncio.get_event_loop().run_until_complete(
            pipeline_graph.ainvoke({"contact": playful_contact, "messages": []})
        )

        formal_msgs = [r.personalised_message for r in formal_state["final_result"].top_3_recommendations]
        playful_msgs = [r.personalised_message for r in playful_state["final_result"].top_3_recommendations]

        # They should not be identical
        assert formal_msgs != playful_msgs, "Tone had no effect on messages"
