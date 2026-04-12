"""
VajraKavach — Test Configuration
Common fixtures and helpers for all tests.
"""

import sys
import os
import pytest

# Ensure backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Base URL for integration tests against the live server
LIVE_SERVER_URL = "https://192.168.3.44"

# Test user credentials (job seeker role)
TEST_EMAIL = "yash25091@iiitd.ac.in"
TEST_PASSWORD = "GraduateAlgo@1198"
