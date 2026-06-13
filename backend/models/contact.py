from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class MessageTone(str, Enum):
    formal = "formal"
    warm = "warm"
    playful = "playful"
    concise = "concise"
    inspiring = "inspiring"


class LinkedInData(BaseModel):
    headline: Optional[str] = None
    summary: Optional[str] = None
    current_company: Optional[str] = None
    current_role: Optional[str] = None
    industry: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    recent_posts: list[str] = Field(default_factory=list)
    recent_comments: list[str] = Field(default_factory=list)
    engaged_topics: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    volunteer_work: list[str] = Field(default_factory=list)
    honors_awards: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)


class GiftConstraints(BaseModel):
    budget_min: float = Field(ge=0)
    budget_max: float = Field(ge=0)
    currency: str = "USD"
    country: str = "US"
    occasion: str
    relationship: str  # colleague, friend, mentor, report, client
    avoid_categories: list[str] = Field(default_factory=list)
    preferences_noted: Optional[str] = None
    tone: MessageTone = MessageTone.warm


class ContactProfile(BaseModel):
    contact_id: str
    name: str
    linkedin_data: LinkedInData
    constraints: GiftConstraints
