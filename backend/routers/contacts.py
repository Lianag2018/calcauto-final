from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from database import db
from models import Contact, ContactCreate, ContactBulkCreate
from dependencies import get_current_user

router = APIRouter()

# ============ Contacts API ============

@router.get("/contacts")
async def get_contacts(authorization: Optional[str] = Header(None)):
    """Récupère les contacts de l'utilisateur connecté"""
    user = await get_current_user(authorization)
    
    # Filtrer par owner_id
    contacts = await db.contacts.find({"owner_id": user["id"]}).sort("name", 1).to_list(10000)
    return [{
        "id": c.get("id"),
        "name": c.get("name"),
        "phone": c.get("phone", ""),
        "email": c.get("email", ""),
        "created_at": c.get("created_at"),
        "source": c.get("source", "import")
    } for c in contacts]

@router.post("/contacts")
async def create_contact(contact: ContactCreate, authorization: Optional[str] = Header(None)):
    """Crée un nouveau contact pour l'utilisateur connecté"""
    user = await get_current_user(authorization)
    
    contact_obj = Contact(
        name=contact.name,
        phone=contact.phone,
        email=contact.email,
        source=contact.source,
        owner_id=user["id"]
    )
    await db.contacts.insert_one(contact_obj.dict())
    return contact_obj

@router.post("/contacts/bulk")
async def create_contacts_bulk(request: ContactBulkCreate, authorization: Optional[str] = Header(None)):
    """Importe plusieurs contacts en masse pour l'utilisateur connecté"""
    user = await get_current_user(authorization)
    
    if not request.contacts:
        return {"success": True, "imported": 0, "message": "Aucun contact à importer"}
    
    # Préparer les contacts avec owner_id
    contacts_to_insert = []
    for c in request.contacts:
        contact_obj = Contact(
            name=c.name,
            phone=c.phone,
            email=c.email,
            source=c.source,
            owner_id=user["id"]
        )
        contacts_to_insert.append(contact_obj.dict())
    
    # Supprimer les doublons par nom+phone POUR CET UTILISATEUR avant insertion
    existing_contacts = await db.contacts.find({"owner_id": user["id"]}, {"name": 1, "phone": 1}).to_list(10000)
    existing_keys = {(c.get("name", "").lower(), c.get("phone", "")) for c in existing_contacts}
    
    new_contacts = []
    for c in contacts_to_insert:
        key = (c.get("name", "").lower(), c.get("phone", ""))
        if key not in existing_keys:
            new_contacts.append(c)
            existing_keys.add(key)  # Éviter les doublons dans le même import
    
    if new_contacts:
        await db.contacts.insert_many(new_contacts)
    
    return {
        "success": True, 
        "imported": len(new_contacts),
        "skipped": len(contacts_to_insert) - len(new_contacts),
        "message": f"{len(new_contacts)} contacts importés, {len(contacts_to_insert) - len(new_contacts)} doublons ignorés"
    }

@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, authorization: Optional[str] = Header(None)):
    """Supprime un contact de l'utilisateur connecté"""
    user = await get_current_user(authorization)
    
    # S'assurer que le contact appartient à l'utilisateur
    result = await db.contacts.delete_one({"id": contact_id, "owner_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact non trouvé")
    return {"success": True, "message": "Contact supprimé"}

@router.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, authorization: Optional[str] = Header(None), name: Optional[str] = None, phone: Optional[str] = None, email: Optional[str] = None):
    """Met à jour un contact de l'utilisateur connecté"""
    user = await get_current_user(authorization)
    
    update_data = {}
    if name: update_data["name"] = name
    if phone: update_data["phone"] = phone
    if email: update_data["email"] = email
    
    if not update_data:
        return {"success": False, "message": "Aucune donnée à mettre à jour"}
    
    result = await db.contacts.update_one(
        {"id": contact_id, "owner_id": user["id"]},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Contact non trouvé")
    return {"success": True, "message": "Contact mis à jour"}

@router.delete("/contacts")
async def delete_all_contacts(authorization: Optional[str] = Header(None)):
    """Supprime tous les contacts de l'utilisateur connecté"""
    user = await get_current_user(authorization)
    
    result = await db.contacts.delete_many({"owner_id": user["id"]})
    return {"success": True, "deleted": result.deleted_count, "message": f"{result.deleted_count} contacts supprimés"}

