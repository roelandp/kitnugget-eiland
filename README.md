# Kit Nugget Eiland

Woordjesspel voor Viggo. Kit Nugget woont op een piepklein eiland; dieren uit de buurt komen langs met een vraag over een woord. Goede antwoorden leveren blokken, meubels en vissnoepjes op, en hoe meer woorden echt geleerd zijn, hoe groter het eiland wordt.

Live: https://roelandp.github.io/kitnugget-eiland/

## Spelen en testen

```bash
npm install
npm run dev -- --host     # open het LAN-adres op iPad of telefoon
npm test                  # engine- en spellogica-tests
npm run build             # productiebuild in dist/
```

Elke push naar `main` bouwt en deployt via GitHub Actions naar GitHub Pages. Het spel is een PWA: op de iPad via Delen > "Zet op beginscherm". Nieuwe versies worden automatisch opgehaald zodra de app weer opent.

Debug: `?cat=sprite` of `?cat=primitive` forceert een andere Kit Nugget.

## Een nieuwe toets toevoegen

1. Maak een foto van de woordenlijst.
2. Geef de foto aan Claude met de vraag: "Maak hier een nieuwe toets van voor Kit Nugget Eiland, datum <datum van de toets>."
3. Claude maakt een JSON-bestand in `src/content/toetsen/`, bijvoorbeeld `toets_12_november.json`:

```json
{
  "toets_12_november": {
    "title": "Toets 12 November: Woordenschat (Thema ...)",
    "date": "2026-11-12",
    "theme": "woordenschat",
    "language": "nl",
    "questions": [
      {
        "word": "de dialoog",
        "definition": "Een gesprek tussen twee mensen.",
        "hint": "Begint met 'dia...', het tegenovergestelde van een monoloog.",
        "sentence": "In de strip voeren de twee helden een grappige ___."
      }
    ]
  }
}
```

   - `word`, `definition` zijn verplicht; `hint`, `sentence` en `date` zijn optioneel.
   - `sentence` heeft `___` op de plek van het woord, zonder lidwoord (`de`/`het`). Uitdrukkingen ("op de hak nemen") en werkwoorden staan er precies zo in als in de lijst.
   - Zonder `sentence` slaat het spel de vraagsoort "zin met gat" over.
   - Hetzelfde formaat als de oude Lexi Brawl `words.json`, dus een oud bestand werkt ook.
4. `npm test` (controleert o.a. dat het bestand klopt), dan commit en push. De toets met de nieuwste datum wordt vanzelf de actieve toets; in Instellingen kun je een andere kiezen. Voortgang van oudere toetsen blijft bewaard en telt mee voor de grootte van het eiland.

## Hoe het leren werkt

- Elk woord klimt langs drie vraagsoorten: herkennen (betekenis, kies het woord), omgekeerd (woord, kies de betekenis) en zin met gat. Typen staat uit (zit nog in de code: `typing: true` in de engine).
- Leitner-doosjes 0 t/m 5 met wachttijden 0, 0, 1, 2, 4, 8 dagen, die krimpen als de toets dichtbij is. De dag voor de toets komt alles onder doosje 4 terug.
- Fout: het goede antwoord komt in beeld, Viggo tikt het alsnog, en het woord komt binnen 3 vragen terug. Voorlezen staat uit.
- "Geleerd" = 3 keer goed, waarvan minstens één keer op een later moment (5+ minuten na een eerder goed antwoord: later in de ronde of de volgende ronde), en het laatste antwoord goed. Kan dus binnen een sessie. In de laatste week voor de toets komen woorden na 3 tot 5 minuten terug.
- De proeftoets is meerkeuze (betekenis of zin met gat), zonder hints en zonder feedback per vraag.
- Woordenkaart: per woord de status, hoe vaak goed/fout, en wanneer het terugkomt. Dit is ook het overzicht voor ouders.

## Eigen 3D-modellen

Optioneel: zet `public/models/kit-nugget.glb` neer (bijvoorbeeld een Tripo3D-scan) en Kit Nugget wordt automatisch dat model, geschaald naar één tegel hoog. Per dier kan ook een GLB: `eend.glb`, `schildpad.glb`, `uil.glb`, `konijn.glb`, `kikker.glb`. Zonder modellen draait alles op sprites en figuurtjes uit code.

## Credits

- Lettertype vragen: SchoolschriftLG, Bart Voorzanger & Liesbeth Flobbe (vrij voor niet-commercieel gebruik), syboor.eu/fonts/schoolschrift03/
- Kit Nugget, Uilie en de Regenboogknuffel: Meshy-modellen, versimpeld met `scripts/simplify-glb.mjs` (texture 1024).
- Papa (Bedhead): Meshy-model van 313 MB, met `scripts/bake-glb-colors.mjs` teruggebracht tot 0,9 MB (kleuren in de hoekpunten, geen texture).
