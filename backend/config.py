from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5-20250929"

    litellm_base_url: str = "https://xc-alb-dev-v2-litellm.xcaliberapis.com"
    litellm_api_key: str = "sk-7ZVZTtP1OALoc53ulVhsJg"
    litellm_model: str = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

    serp_api_key: str = ""
    google_cse_api_key: str = ""
    google_cse_cx: str = ""

    max_search_retries: int = 2
    min_valid_products: int = 3

    redis_url: str = ""
    cache_ttl_seconds: int = 86400  # 24 hours

    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_base_url: str = "https://us.cloud.langfuse.com"


settings = Settings()
