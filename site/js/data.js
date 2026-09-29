// Loads the data pack that scripts/export_site_data.py writes into site/data/.
export async function loadData() {
  // The files download at the same time; the site waits until all of them have arrived
  const [closet, trends, brands] = await Promise.all(
    ['closet', 'trends', 'brands'].map((name) => getJSON(`data/${name}.json`))
  );
  return { closet, trends, brands };
}

async function getJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Couldn't load ${path} (HTTP ${response.status})`);
  return response.json();
}
