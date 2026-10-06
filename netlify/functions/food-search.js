// Food lookup: USDA FoodData Central by name, and Open Food Facts by barcode.
// GET ?q=<text>           -> USDA search, returns up to 15 foods with kcal & protein per 100g (or per serving)
// GET ?barcode=<digits>   -> Open Food Facts lookup, returns one product
const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(obj),
});

function nutrient(foodNutrients, ids) {
  // foodNutrients: USDA array; ids: list of nutrient numbers to match
  for (const n of foodNutrients || []) {
    const num = n.nutrientNumber || (n.nutrient && n.nutrient.number);
    if (num && ids.includes(String(num))) {
      const v = n.value != null ? n.value : n.amount;
      if (typeof v === "number") return v;
    }
  }
  return null;
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};

    if (q.barcode) {
      const code = String(q.barcode).replace(/[^0-9]/g, "");
      if (!code) return json(400, { error: "bad barcode" });
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_size`);
      if (!r.ok) return json(502, { error: "off " + r.status });
      const d = await r.json();
      if (d.status !== 1 || !d.product) return json(200, { found: false });
      const n = d.product.nutriments || {};
      const per100 = {
        name: [d.product.brands, d.product.product_name].filter(Boolean).join(" ").trim() || "Scanned product",
        kcal100: n["energy-kcal_100g"] != null ? n["energy-kcal_100g"] : (n["energy-kcal"] != null ? n["energy-kcal"] : null),
        protein100: n["proteins_100g"] != null ? n["proteins_100g"] : null,
        serving: d.product.serving_size || null,
        kcalServing: n["energy-kcal_serving"] != null ? n["energy-kcal_serving"] : null,
        proteinServing: n["proteins_serving"] != null ? n["proteins_serving"] : null,
      };
      return json(200, { found: true, product: per100 });
    }

    const term = (q.q || "").trim();
    if (!term) return json(400, { error: "missing q" });
    const key = process.env.USDA_API_KEY;
    if (!key) return json(200, { configured: false, foods: [] });

    const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: term, pageSize: 15,
        dataType: ["Foundation", "SR Legacy", "Branded"],
      }),
    });
    if (!r.ok) return json(502, { error: "usda " + r.status });
    const d = await r.json();
    const foods = (d.foods || []).map(f => {
      const kcal = nutrient(f.foodNutrients, ["208", "1008"]);   // Energy (kcal)
      const protein = nutrient(f.foodNutrients, ["203", "1003"]); // Protein
      // Branded foods carry serving info; Foundation/SR are per 100g
      const servingG = f.servingSize && /g/i.test(f.servingSizeUnit || "") ? f.servingSize : null;
      return {
        fdcId: f.fdcId,
        name: [f.brandOwner || f.brandName, f.description].filter(Boolean).join(" — ").slice(0, 90),
        kcal100: kcal,       // per 100 g
        protein100: protein, // per 100 g
        servingG,            // grams in one serving, if known
      };
    }).filter(f => f.kcal100 != null || f.protein100 != null);
    return json(200, { configured: true, foods });
  } catch (e) {
    return json(500, { error: String(e && e.message || e) });
  }
};
