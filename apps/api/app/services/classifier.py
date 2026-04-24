"""
Automatic product category classifier.

Uses keyword-based rules as a fast default, with optional LLM classification
for items that don't match any rule.
"""
import logging
import re

logger = logging.getLogger(__name__)

CATEGORIES: dict[str, list[str]] = {
    "Verduras": [
        "tomate", "cebolla", "papa", "patata", "zanahoria", "lechuga", "pepino",
        "brocoli", "brócoli", "espinaca", "apio", "pimiento", "ajo", "calabaza",
        "berenjena", "chayote", "ejote", "elote", "maíz", "maiz", "nopales",
        "aguacate", "chile", "jalapeño", "habanero", "cilantro", "perejil",
        "acelga", "coliflor", "repollo", "col", "rábano", "betabel",
        "champiñon", "champiñón", "hongo", "seta", "vegetal", "verdura",
        "tomato", "onion", "potato", "carrot", "lettuce", "cucumber",
        "broccoli", "spinach", "celery", "pepper", "garlic", "squash",
        "eggplant", "corn", "mushroom", "vegetable",
    ],
    "Frutas": [
        "manzana", "naranja", "plátano", "platano", "banana", "fresa",
        "uva", "piña", "mango", "papaya", "sandía", "sandia", "melón", "melon",
        "limón", "limon", "lima", "toronja", "mandarina", "kiwi", "pera",
        "durazno", "cereza", "frambuesa", "arándano", "arandano", "mora",
        "guayaba", "maracuyá", "maracuya", "coco", "fruta",
        "apple", "orange", "strawberry", "grape", "pineapple", "watermelon",
        "lemon", "lime", "peach", "cherry", "blueberry", "raspberry", "fruit",
    ],
    "Carnes": [
        "pollo", "res", "cerdo", "carne", "pechuga", "muslo", "filete", "lomo",
        "costilla", "chuleta", "bistec", "milanesa", "molida", "chorizo",
        "tocino", "bacon", "jamón", "jamon", "salchicha", "longaniza",
        "arrachera", "ribeye", "t-bone", "sirloin", "brisket",
        "chicken", "beef", "pork", "meat", "breast", "thigh", "steak",
        "ribs", "chop", "sausage", "ham", "ground", "tenderloin",
        "cordero", "lamb", "pavo", "turkey", "conejo", "rabbit",
    ],
    "Pescados y Mariscos": [
        "pescado", "salmón", "salmon", "atún", "atun", "tilapia", "robalo",
        "huachinango", "mero", "bacalao", "sardina", "trucha",
        "camarón", "camaron", "pulpo", "calamar", "langosta", "almeja",
        "mejillón", "mejillon", "ostión", "ostion", "marisco",
        "fish", "salmon", "tuna", "shrimp", "lobster", "squid", "octopus",
        "seafood", "cod", "trout", "clam", "mussel", "oyster", "crab",
    ],
    "Lácteos": [
        "leche", "queso", "crema", "yogur", "yogurt", "mantequilla", "nata",
        "requesón", "requeson", "suero", "lácteo", "lacteo",
        "milk", "cheese", "cream", "butter", "dairy", "mozzarella",
        "cheddar", "parmesan", "gouda", "ricotta", "brie",
    ],
    "Huevos": [
        "huevo", "egg", "blanquillo",
    ],
    "Panadería": [
        "pan", "tortilla", "bolillo", "telera", "baguette", "croissant",
        "galleta", "pastel", "cake", "bread", "toast", "tostada",
        "harina", "flour", "levadura", "yeast", "masa",
    ],
    "Bebidas": [
        "agua", "refresco", "jugo", "cerveza", "vino", "tequila", "mezcal",
        "ron", "whisky", "vodka", "licor", "café", "cafe", "te ", " té ",
        "soda", "coca", "pepsi", "sprite", "gaseosa", "bebida",
        "water", "juice", "beer", "wine", "coffee", "tea", "drink",
        "soda", "soft drink", "mineral", "sparkling",
    ],
    "Aceites y Condimentos": [
        "aceite", "oil", "olive", "oliva", "vinagre", "vinegar",
        "sal ", " sal", "salt", "pimienta", "pepper", "azúcar", "azucar",
        "sugar", "salsa", "sauce", "mayonesa", "mayo", "ketchup", "mostaza",
        "mustard", "soya", "soy", "condimento", "especia", "spice",
        "orégano", "oregano", "canela", "cinnamon", "comino", "cumin",
    ],
    "Granos y Cereales": [
        "arroz", "rice", "frijol", "bean", "lenteja", "lentil",
        "garbanzo", "chickpea", "avena", "oat", "cereal", "pasta",
        "spaghetti", "espagueti", "macarrón", "macarron", "fideos",
        "quinoa", "cuscús", "cuscus", "semilla", "seed",
    ],
    "Enlatados y Conservas": [
        "lata", "enlatado", "conserva", "can ", "canned",
        "puré", "pure", "concentrado", "concentrate",
    ],
    "Limpieza": [
        "detergente", "jabón", "jabon", "cloro", "blanqueador", "desinfectante",
        "limpiador", "escoba", "trapeador", "esponja", "bolsa basura",
        "papel higiénico", "papel higienico", "servilleta", "toalla",
        "soap", "bleach", "disinfectant", "cleaner", "detergent",
        "trash bag", "napkin", "tissue", "cleaning",
    ],
    "Desechables": [
        "vaso desechable", "plato desechable", "cubierto", "popote",
        "contenedor", "aluminio", "film", "plástico", "plastico",
        "disposable", "foam", "styrofoam", "wrap", "foil",
    ],
    "Otros": [],
}

_CATEGORY_INDEX: list[tuple[str, re.Pattern]] = []

def _build_index():
    global _CATEGORY_INDEX
    if _CATEGORY_INDEX:
        return
    for cat, keywords in CATEGORIES.items():
        if not keywords:
            continue
        escaped = [re.escape(k.strip()) for k in keywords if k.strip()]
        if escaped:
            pattern = re.compile("|".join(escaped), re.IGNORECASE)
            _CATEGORY_INDEX.append((cat, pattern))

_build_index()


def classify_item(description: str) -> str:
    """
    Classify a product description into a category using keyword matching.
    Returns the category name or "Otros" if no match.
    """
    if not description:
        return "Otros"

    text = description.lower().strip()

    for cat, pattern in _CATEGORY_INDEX:
        if pattern.search(text):
            return cat

    return "Otros"


def classify_items_batch(descriptions: list[str]) -> list[str]:
    """Classify multiple items at once."""
    return [classify_item(d) for d in descriptions]


def classify_with_llm(descriptions: list[str]) -> list[str]:
    """
    Use OpenAI to classify items that the keyword classifier marked as 'Otros'.
    Falls back to keyword classifier if LLM is not available.
    """
    from app.config import get_settings
    settings = get_settings()

    if settings.llm_provider != "openai" or not settings.openai_api_key:
        return classify_items_batch(descriptions)

    unclassified = []
    results = []
    indices = []

    for i, desc in enumerate(descriptions):
        cat = classify_item(desc)
        results.append(cat)
        if cat == "Otros" and desc.strip():
            unclassified.append(desc)
            indices.append(i)

    if not unclassified:
        return results

    try:
        import json
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        valid_cats = [c for c in CATEGORIES.keys()]

        prompt = (
            "Classify each product into one of these categories:\n"
            f"{', '.join(valid_cats)}\n\n"
            "Products:\n"
            + "\n".join(f"{i+1}. {d}" for i, d in enumerate(unclassified))
            + "\n\nReturn a JSON array of category strings, one per product. "
            "Only use the exact category names listed above."
        )

        response = client.chat.completions.create(
            model=settings.openai_model or "gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You classify restaurant/food-service products into categories. Return JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=1000,
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        categories = data.get("categories", data.get("results", []))

        if isinstance(categories, list):
            for j, idx in enumerate(indices):
                if j < len(categories) and categories[j] in valid_cats:
                    results[idx] = categories[j]

        logger.info("LLM classified %d/%d items", len(indices), len(descriptions))

    except Exception as e:
        logger.warning("LLM classification failed, using keyword fallback: %s", e)

    return results
