import os


os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///./test_interview_platform.db"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret-with-sufficient-length"
os.environ["SUPABASE_JWT_AUDIENCE"] = "authenticated"
os.environ["EMAIL_DELIVERY_MODE"] = "console"
