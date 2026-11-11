# Herkunft der Erddaten

**Bildkacheln:** NASA GIBS BlueMarble_ShadedRelief_Bathymetry, 500 m, EPSG:4326, WMTS. Statisches
Blue-Marble-Komposit, keine Live-Bilder. Die fünfzehn JPEG-Ersatzkacheln der Stufe 2 in `2/<zeile>/<spalte>.jpeg`
wurden am 08.10.2026 heruntergeladen; feinere Stufen lädt `earth-tiles.mjs` zur Laufzeit nach.

- https://nasa-gibs.github.io/gibs-api-docs/
- https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg

**Vektordaten (`boundaries.json`):** Küstenlinien, Ländergrenzen und Beschriftungspunkte aus Natural
Earth 1:50m Admin 0 Countries, gemeinfrei. Am 09.10.2026 aus dem Natural-Earth-Repository
heruntergeladen. Für eine kompakte Speicherung auf vier Nachkommastellen gerundet; Linienzüge und
Beschriftungspositionen bleiben erhalten. Aufbau: `lines` (Liste von Linienzügen aus [Länge, Breite]
in Grad) und `labels` (Liste von [Name, Länge, Breite, Einwohnerzahl]; die Einwohnerzahl bestimmt die
Rangfolge der Beschriftungen in `planet-overlay.mjs`).

- https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/
- https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
