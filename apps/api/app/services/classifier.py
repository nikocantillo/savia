"""
Automatic product category classifier.

Uses keyword-based rules as a fast default, with optional LLM classification
for items that don't match any rule.

Keywords use word-boundary matching (\b) to avoid false positives like
"aporte" matching the drink keyword "te".
"""
import logging
import re

logger = logging.getLogger(__name__)

CATEGORIES: dict[str, list[str]] = {
    "Verduras": [
        "tomate", "tomates", "cebolla", "papa", "papas", "patata", "zanahoria",
        "lechuga", "pepino", "brocoli", "brócoli", "espinaca", "apio", "pimiento",
        "ajo", "calabaza", "calabacin", "berenjena", "chayote", "ejote", "ejotes",
        "elote", "maíz", "maiz", "cilantro", "perejil", "acelga", "coliflor",
        "repollo", "rábano", "rabano", "betabel", "champiñon", "champiñón",
        "hongo", "hongos", "seta", "vegetal", "verdura", "verduras", "habichuela",
        "arveja", "arvejas", "ahuyama",
    ],
    "Frutas": [
        "manzana", "naranja", "naranjas", "plátano", "platano", "banana",
        "fresa", "fresas", "uva", "uvas", "piña", "mango", "papaya",
        "sandía", "sandia", "melón", "melon", "limón", "limon", "limones",
        "lima", "toronja", "mandarina", "kiwi", "pera", "durazno",
        "cereza", "frambuesa", "arándano", "arandano", "mora", "moras",
        "guayaba", "maracuyá", "maracuya", "coco", "fruta", "frutas",
        "lulo", "curuba", "feijoa", "uchuva", "granadilla",
    ],
    "Carnes": [
        "pollo", "res", "cerdo", "carne", "carnes", "pechuga", "muslo",
        "filete", "lomo", "costilla", "costillas", "chuleta", "bistec",
        "milanesa", "molida", "chorizo", "tocino", "bacon", "jamón", "jamon",
        "salchicha", "longaniza", "arrachera", "ribeye", "sirloin", "brisket",
        "chicken", "beef", "pork", "meat", "steak", "ribs", "sausage", "ham",
        "cordero", "lamb", "pavo", "turkey", "conejo",
        "mondongo", "chicharron", "chicharrón", "morcilla", "butifarra",
    ],
    "Pescados y Mariscos": [
        "pescado", "salmón", "salmon", "atún", "atun", "tilapia", "robalo",
        "huachinango", "mero", "bacalao", "sardina", "trucha", "mojarra",
        "camarón", "camaron", "camarones", "pulpo", "calamar", "langosta",
        "almeja", "mejillón", "mejillon", "marisco", "mariscos",
        "fish", "shrimp", "lobster", "squid", "octopus", "seafood",
    ],
    "Lácteos": [
        "leche", "queso", "crema de leche", "yogur", "yogurt", "mantequilla",
        "requesón", "requeson", "lácteo", "lacteo",
        "mozzarella", "cheddar", "parmesan", "parmesano", "ricotta", "gouda",
        "kumis", "avena con leche",
    ],
    "Huevos": [
        "huevo", "huevos", "egg", "eggs", "blanquillo",
    ],
    "Panadería": [
        "pan de", "pan tajado", "pan blanco", "pan integral", "pan artesanal",
        "pandebono", "pandeyuca", "buñuelo", "bunuelo", "arepa", "arepas",
        "tortilla", "bolillo", "baguette", "croissant", "empanada", "empanadas",
        "galleta", "galletas", "pastel", "torta", "ponqué", "ponque",
        "harina", "levadura", "masa", "bread", "cake",
    ],
    "Bebidas": [
        "agua", "agua mineral", "refresco", "jugo", "jugos",
        "cerveza", "cervezas", "vino", "vinos", "tequila", "mezcal",
        "whisky", "whiskey", "vodka", "licor", "licores", "aguardiente",
        "café", "cafe", "cappuccino", "espresso", "latte",
        "gaseosa", "gaseosas", "coca cola", "pepsi", "sprite", "bebida", "bebidas",
        "limonada", "naranjada", "jugo de", "smoothie", "malteada",
        "aromática", "aromatica", "infusión", "infusion",
        "water", "juice", "beer", "wine", "coffee", "tea", "soda",
        "soft drink", "sparkling", "kombucha",
    ],
    "Aceites y Condimentos": [
        "aceite", "aceite de oliva", "aceite vegetal",
        "vinagre", "salsa", "salsas", "mayonesa", "ketchup", "mostaza",
        "soya", "condimento", "especia", "especias", "sazonador",
        "orégano", "oregano", "canela", "comino", "pimienta", "pimentón",
        "azúcar", "azucar", "panela",
        "oil", "olive oil", "vinegar", "sauce", "mustard", "sugar",
    ],
    "Granos y Cereales": [
        "arroz", "frijol", "frijoles", "lenteja", "lentejas",
        "garbanzo", "garbanzos", "avena", "cereal", "cereales",
        "pasta", "spaghetti", "espagueti", "fideos", "macarrones",
        "quinoa", "granola", "semilla", "semillas",
        "rice", "beans", "lentils", "oats", "pasta",
    ],
    "Enlatados y Conservas": [
        "enlatado", "enlatados", "conserva", "conservas",
        "atún en lata", "sardinas en lata",
        "puré", "pure", "concentrado",
    ],
    "Limpieza": [
        "detergente", "jabón", "jabon", "cloro", "blanqueador", "desinfectante",
        "limpiador", "escoba", "trapeador", "esponja", "bolsa de basura",
        "papel higiénico", "papel higienico", "servilleta", "servilletas",
        "cleaning", "soap", "bleach", "disinfectant", "detergent",
    ],
    "Desechables": [
        "vaso desechable", "plato desechable", "cubiertos desechables",
        "contenedor", "papel aluminio", "film", "plástico", "plastico",
        "pitillo", "pitillos", "disposable", "foam", "styrofoam",
    ],
    "Otros": [],
}

_CATEGORY_INDEX: list[tuple[str, re.Pattern]] = []


def _build_index():
    global _CATEGORY_INDEX
    _CATEGORY_INDEX = []
    for cat, keywords in CATEGORIES.items():
        if not keywords:
            continue
        patterns = []
        for kw in keywords:
            kw = kw.strip()
            if not kw:
                continue
            escaped = re.escape(kw)
            patterns.append(rf"\b{escaped}\b")
        if patterns:
            combined = re.compile("|".join(patterns), re.IGNORECASE)
            _CATEGORY_INDEX.append((cat, combined))


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
    return [classify_item(d) for d in descriptions]


def classify_with_llm(descriptions: list[str]) -> list[str]:
    """
    Use OpenAI to classify items that the keyword classifier marked as 'Otros'.
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
            "Clasifica cada producto de restaurante/alimentos en una de estas categorías:\n"
            f"{', '.join(valid_cats)}\n\n"
            "Si el producto NO es un alimento, bebida o insumo de restaurante "
            "(por ejemplo: nómina, impuestos, servicios, tecnología, arriendos), "
            "clasifícalo como 'Otros'.\n\n"
            "Productos:\n"
            + "\n".join(f"{i+1}. {d}" for i, d in enumerate(unclassified))
            + "\n\nDevuelve un JSON con la clave 'categories' que sea un array de strings, "
            "uno por producto. Usa solo los nombres exactos de las categorías listadas."
        )

        response = client.chat.completions.create(
            model=settings.openai_model or "gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Eres un clasificador de productos de restaurante colombiano. Devuelves JSON únicamente."},
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
