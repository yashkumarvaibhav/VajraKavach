"""
VajraKavach — Resume Parser Service
Extracts text from PDF/DOCX resumes and performs keyword-based skill matching.
"""

import io
import re
from typing import List, Optional

import PyPDF2
import docx


def extract_text_from_pdf(data: bytes) -> str:
    """Extract all text from a PDF file."""
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    return "\n".join(text_parts)


def extract_text_from_docx(data: bytes) -> str:
    """Extract all text from a DOCX file."""
    doc = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_text(data: bytes, mime_type: str) -> str:
    """Extract text from a resume file based on MIME type."""
    if "pdf" in mime_type.lower():
        return extract_text_from_pdf(data)
    elif "docx" in mime_type.lower() or "openxmlformats" in mime_type.lower():
        return extract_text_from_docx(data)
    else:
        # Try PDF first, then DOCX
        try:
            return extract_text_from_pdf(data)
        except Exception:
            try:
                return extract_text_from_docx(data)
            except Exception:
                return ""


def extract_skills_from_text(text: str) -> List[str]:
    """
    Extract likely skill keywords from resume text.
    Uses a curated list of common tech/business skills.
    """
    SKILL_KEYWORDS = [
        # Programming Languages
        "python", "java", "javascript", "typescript", "c\\+\\+", "c#", "ruby", "go",
        "rust", "php", "swift", "kotlin", "scala", "r", "matlab", "perl", "dart",
        "html", "css", "sql", "bash", "shell",
        # Frameworks & Libraries
        "react", "angular", "vue", "django", "flask", "fastapi", "spring", "express",
        "node\\.js", "nodejs", "next\\.js", "nextjs", "tailwind", "bootstrap",
        "tensorflow", "pytorch", "keras", "pandas", "numpy", "scikit-learn",
        "jquery", "redux", "graphql", "rest api", "restful",
        # Databases
        "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "sqlite",
        "oracle", "cassandra", "dynamodb", "firebase",
        # Cloud & DevOps
        "aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "terraform",
        "ansible", "ci/cd", "cicd", "github actions", "gitlab",
        "linux", "nginx", "apache",
        # Data & AI
        "machine learning", "deep learning", "nlp", "natural language processing",
        "computer vision", "data science", "data engineering", "big data",
        "hadoop", "spark", "tableau", "power bi",
        # Security
        "cybersecurity", "penetration testing", "cryptography", "encryption",
        "oauth", "jwt", "ssl", "tls",
        # General
        "agile", "scrum", "jira", "git", "figma", "photoshop",
        "project management", "communication", "leadership", "teamwork",
    ]

    text_lower = text.lower()
    found = set()
    for skill in SKILL_KEYWORDS:
        if re.search(r'\b' + skill + r'\b', text_lower):
            # Normalize the display name
            clean = skill.replace("\\+\\+", "++").replace("\\.", ".").replace("\\.js", ".js")
            found.add(clean)
    return sorted(found)


def compute_match_score(
    resume_skills: List[str],
    required_skills: List[str],
) -> dict:
    """
    Compute a match score between resume skills and job required skills.
    Returns: { score: float (0-100), matched: [...], missing: [...] }
    """
    if not required_skills:
        return {"score": 100.0, "matched": [], "missing": []}

    resume_set = {s.lower().strip() for s in resume_skills}
    required_set = {s.lower().strip() for s in required_skills if s.strip()}

    matched = []
    missing = []
    for skill in required_set:
        # Fuzzy: check if the required skill appears in any resume skill
        found = False
        for rs in resume_set:
            if skill in rs or rs in skill:
                found = True
                matched.append(skill)
                break
        if not found:
            missing.append(skill)

    total = len(required_set)
    score = (len(matched) / total * 100) if total > 0 else 100.0

    return {
        "score": round(score, 1),
        "matched": matched,
        "missing": missing,
    }
