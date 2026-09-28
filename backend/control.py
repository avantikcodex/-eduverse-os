from typing import Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import supabase
from main import app


ADMIN_ROLES = {
    "super_admin",
    "user_admin",
    "content_admin",
    "ai_admin",
    "support_admin",
    "auditor",
}


class SubjectCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ChapterCreate(BaseModel):
    subject_id: str
    title: str
    chapter_number: Optional[int] = None
    description: Optional[str] = None


class UserStatusUpdate(BaseModel):
    status: str


class FeedbackCreate(BaseModel):
    rating: Optional[int] = None
    type: str = "general"
    title: Optional[str] = None
    message: str
    page: Optional[str] = None
    feature: Optional[str] = None


class FeedbackStatusUpdate(BaseModel):
    status: str
    admin_notes: Optional[str] = None


def token_from_request(request: Request) -> str:
    authorization = request.headers.get("Authorization", "")

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    token = authorization[7:].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing access token",
        )

    return token


def authenticated_user(request: Request):
    token = token_from_request(request)

    try:
        response = supabase.auth.get_user(token)
        user = response.user

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid session",
            )

        return user

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {exc}",
        )


def user_profile(user_id: str):
    result = (
        supabase
        .table("users")
        .select("id,full_name,email,role,status,college,course,year")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=403,
            detail="User profile not found",
        )

    return result.data


def require_admin(request: Request):
    user = authenticated_user(request)
    profile = user_profile(str(user.id))

    if profile["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="Account is not active",
        )

    if profile["role"] not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Administrator access required",
        )

    return user, profile


def require_super_admin(request: Request):
    user, profile = require_admin(request)

    if profile["role"] != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Super Admin permission required",
        )

    return user, profile


def audit(
    actor_id: str,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    try:
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "metadata": metadata or {},
            }
        ).execute()
    except Exception:
        # Audit failures must not break the main operation.
        pass


# ============================================================
# AUTHORIZATION MIDDLEWARE FOR NEW CONTROL API
# ============================================================

@app.middleware("http")
async def control_access(request: Request, call_next):
    path = request.url.path

    if request.method == "OPTIONS":
        return await call_next(request)

    if path.startswith("/control/"):
        try:
            require_admin(request)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )
        except Exception:
            return JSONResponse(
                status_code=401,
                content={"detail": "Authentication failed"},
            )

    if path == "/feedback":
        try:
            authenticated_user(request)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )

    return await call_next(request)


# ============================================================
# OVERVIEW
# ============================================================

@app.get("/control/overview")
def control_overview(request: Request):
    user, profile = require_admin(request)

    try:
        students = (
            supabase
            .table("users")
            .select("id")
            .eq("role", "student")
            .execute()
        )

        teachers = (
            supabase
            .table("users")
            .select("id")
            .eq("role", "teacher")
            .execute()
        )

        subjects = (
            supabase
            .table("subjects")
            .select("id,name,code,is_active")
            .execute()
        )

        materials = (
            supabase
            .table("materials")
            .select("id")
            .execute()
        )

        feedback = (
            supabase
            .table("feedback")
            .select("id,status")
            .execute()
        )

        features = (
            supabase
            .table("feature_flags")
            .select("feature_key,display_name,enabled,description")
            .order("display_name")
            .execute()
        )

        return {
            "admin": {
                "id": str(user.id),
                "name": profile["full_name"],
                "email": profile["email"],
                "role": profile["role"],
            },
            "counts": {
                "students": len(students.data or []),
                "teachers": len(teachers.data or []),
                "subjects": len(subjects.data or []),
                "materials": len(materials.data or []),
                "feedback": len(feedback.data or []),
            },
            "subjects": subjects.data or [],
            "features": features.data or [],
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Admin overview failed: {exc}",
        )


# ============================================================
# SUBJECTS
# ============================================================

@app.get("/control/subjects")
def list_subjects(request: Request):
    require_admin(request)

    result = (
        supabase
        .table("subjects")
        .select("*")
        .order("name")
        .execute()
    )

    return result.data or []


@app.post("/control/subjects")
def create_subject(
    payload: SubjectCreate,
    request: Request,
):
    user, profile = require_admin(request)

    if profile["role"] not in {
        "super_admin",
        "content_admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="Content administration permission required",
        )

    if not payload.name.strip():
        raise HTTPException(
            status_code=400,
            detail="Subject name is required",
        )

    result = (
        supabase
        .table("subjects")
        .insert(
            {
                "name": payload.name.strip(),
                "code": payload.code.strip()
                if payload.code
                else None,
                "description": payload.description,
                "created_by": str(user.id),
                "is_active": True,
            }
        )
        .execute()
    )

    subject = result.data[0]

    audit(
        str(user.id),
        "subject.created",
        "subject",
        subject["id"],
        {"name": subject["name"]},
    )

    return subject


@app.patch("/control/subjects/{subject_id}")
def update_subject(
    subject_id: str,
    payload: SubjectUpdate,
    request: Request,
):
    user, profile = require_admin(request)

    if profile["role"] not in {
        "super_admin",
        "content_admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="Content administration permission required",
        )

    updates = payload.model_dump(exclude_none=True)

    if "name" in updates:
        updates["name"] = updates["name"].strip()

    result = (
        supabase
        .table("subjects")
        .update(updates)
        .eq("id", subject_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Subject not found",
        )

    audit(
        str(user.id),
        "subject.updated",
        "subject",
        subject_id,
        updates,
    )

    return result.data[0]


# ============================================================
# CHAPTERS
# ============================================================

@app.get("/control/chapters")
def list_chapters(
    request: Request,
    subject_id: Optional[str] = None,
):
    require_admin(request)

    query = (
        supabase
        .table("chapters")
        .select("*")
        .order("chapter_number")
    )

    if subject_id:
        query = query.eq("subject_id", subject_id)

    result = query.execute()

    return result.data or []


@app.post("/control/chapters")
def create_chapter(
    payload: ChapterCreate,
    request: Request,
):
    user, profile = require_admin(request)

    if profile["role"] not in {
        "super_admin",
        "content_admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="Content administration permission required",
        )

    result = (
        supabase
        .table("chapters")
        .insert(
            {
                "subject_id": payload.subject_id,
                "title": payload.title.strip(),
                "chapter_number": payload.chapter_number,
                "description": payload.description,
                "is_active": True,
            }
        )
        .execute()
    )

    chapter = result.data[0]

    audit(
        str(user.id),
        "chapter.created",
        "chapter",
        chapter["id"],
        {"title": chapter["title"]},
    )

    return chapter


# ============================================================
# USERS
# ============================================================

@app.get("/control/users")
def list_users(
    request: Request,
    role: Optional[str] = None,
):
    require_admin(request)

    query = (
        supabase
        .table("users")
        .select(
            "id,full_name,email,role,status,college,course,year,created_at,last_login_at"
        )
        .order("created_at", desc=True)
    )

    if role:
        query = query.eq("role", role)

    result = query.execute()

    return result.data or []


@app.patch("/control/users/{user_id}/status")
def update_user_status(
    user_id: str,
    payload: UserStatusUpdate,
    request: Request,
):
    actor, profile = require_admin(request)

    if profile["role"] not in {
        "super_admin",
        "user_admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="User administration permission required",
        )

    if payload.status not in {
        "active",
        "suspended",
        "pending",
    }:
        raise HTTPException(
            status_code=400,
            detail="Invalid user status",
        )

    target = (
        supabase
        .table("users")
        .select("id,role,email,status")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not target.data:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    target_role = target.data["role"]

    if (
        target_role == "super_admin"
        and profile["role"] != "super_admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only Super Admin can modify another Super Admin",
        )

    result = (
        supabase
        .table("users")
        .update({"status": payload.status})
        .eq("id", user_id)
        .execute()
    )

    audit(
        str(actor.id),
        "user.status_changed",
        "user",
        user_id,
        {"status": payload.status},
    )

    return result.data[0]


# ============================================================
# FEATURES
# ============================================================

@app.get("/control/features")
def list_features(request: Request):
    require_admin(request)

    result = (
        supabase
        .table("feature_flags")
        .select("*")
        .order("display_name")
        .execute()
    )

    return result.data or []


@app.patch("/control/features/{feature_key}")
def update_feature(
    feature_key: str,
    enabled: bool,
    request: Request,
):
    actor, profile = require_admin(request)

    if profile["role"] not in {
        "super_admin",
        "ai_admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="AI/feature administration permission required",
        )

    result = (
        supabase
        .table("feature_flags")
        .update(
            {
                "enabled": enabled,
                "updated_by": str(actor.id),
            }
        )
        .eq("feature_key", feature_key)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Feature not found",
        )

    audit(
        str(actor.id),
        "feature.changed",
        "feature_flag",
        result.data[0]["id"],
        {
            "feature_key": feature_key,
            "enabled": enabled,
        },
    )

    return result.data[0]


# ============================================================
# FEEDBACK
# ============================================================

@app.post("/feedback")
def create_feedback(
    payload: FeedbackCreate,
    request: Request,
):
    user = authenticated_user(request)

    if not payload.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Feedback message is required",
        )

    if payload.rating is not None and not 1 <= payload.rating <= 5:
        raise HTTPException(
            status_code=400,
            detail="Rating must be between 1 and 5",
        )

    if payload.type not in {
        "bug",
        "feature",
        "question",
        "general",
    }:
        raise HTTPException(
            status_code=400,
            detail="Invalid feedback type",
        )

    result = (
        supabase
        .table("feedback")
        .insert(
            {
                "user_id": str(user.id),
                "rating": payload.rating,
                "type": payload.type,
                "title": payload.title,
                "message": payload.message.strip(),
                "page": payload.page,
                "feature": payload.feature,
                "status": "new",
            }
        )
        .execute()
    )

    return {
        "success": True,
        "feedback": result.data[0],
    }


@app.get("/control/feedback")
def list_feedback(request: Request):
    require_admin(request)

    result = (
        supabase
        .table("feedback")
        .select(
            "id,user_id,rating,type,title,message,page,feature,status,admin_notes,created_at"
        )
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )

    return result.data or []


@app.patch("/control/feedback/{feedback_id}")
def update_feedback(
    feedback_id: str,
    payload: FeedbackStatusUpdate,
    request: Request,
):
    actor, profile = require_admin(request)

    if profile["role"] not in {
        "super_admin",
        "support_admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="Support administration permission required",
        )

    allowed = {
        "new",
        "reviewing",
        "planned",
        "resolved",
        "closed",
    }

    if payload.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Invalid feedback status",
        )

    result = (
        supabase
        .table("feedback")
        .update(
            {
                "status": payload.status,
                "admin_notes": payload.admin_notes,
            }
        )
        .eq("id", feedback_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Feedback not found",
        )

    audit(
        str(actor.id),
        "feedback.updated",
        "feedback",
        feedback_id,
        {"status": payload.status},
    )

    return result.data[0]


# ============================================================
# AUDIT LOGS
# ============================================================

@app.get("/control/logs")
def list_logs(request: Request):
    require_admin(request)

    result = (
        supabase
        .table("audit_logs")
        .select(
            "id,actor_id,action,resource_type,resource_id,metadata,created_at"
        )
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )

    return result.data or []
