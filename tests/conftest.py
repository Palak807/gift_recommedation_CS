import os
import pytest

# Point deepeval's built-in OpenAI evaluator at our LiteLLM proxy
os.environ.setdefault("OPENAI_API_KEY", "sk-7ZVZTtP1OALoc53ulVhsJg")
os.environ.setdefault("OPENAI_BASE_URL", "https://xc-alb-dev-v2-litellm.xcaliberapis.com")
os.environ.setdefault("OPENAI_MODEL_NAME", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")

SAMPLE_CONTACT = {
    "contact_id": "test_001",
    "name": "Arjun Mehta",
    "linkedin_data": {
        "headline": "Engineering Manager @ Zepto | Ultramarathon runner",
        "summary": "8 years scaling engineering teams. Avid ultramarathon runner. Reads systems thinking books. Uses Obsidian/Zettelkasten.",
        "current_company": "Zepto",
        "current_role": "Engineering Manager",
        "industry": "Technology",
        "skills": ["Engineering Management", "System Design", "Ultramarathon", "Python", "Stoicism"],
        "recent_posts": [
            "Finished the Auroville Half-Marathon. 6 months of 5am training runs.",
            "Reading The Almanack of Naval Ravikant. Chapter on specific knowledge is reshaping how I hire.",
        ],
        "recent_comments": ["Been using Obsidian for 18 months. Bi-directional links are genuinely useful."],
        "engaged_topics": ["ultramarathon running", "systems thinking", "productivity tooling", "stoic philosophy"],
        "education": ["IIT Bombay — B.Tech Computer Science"],
        "certifications": [],
        "volunteer_work": ["Mentors first-gen college students at iMentor India"],
        "honors_awards": ["Flipkart Outstanding Engineer 2019"],
        "interests": ["Trail running", "Reading", "Zettelkasten"],
    },
    "constraints": {
        "budget_min": 2000,
        "budget_max": 8000,
        "currency": "INR",
        "country": "IN",
        "occasion": "Work anniversary — 5 years",
        "relationship": "colleague",
        "avoid_categories": ["alcohol", "food perishables"],
        "preferences_noted": "Travels light, values quality over quantity",
        "tone": "warm",
    },
}
