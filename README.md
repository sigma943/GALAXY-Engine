# Galaxy Engine 5.0 + Galaxy Lab

Osobny silnik fotograficznego kosmosu w TypeScript i samodzielne laboratorium Vite/Capacitor. Jedna globalna scena, jeden canvas; React jest opcjonalnym adapterem. Repozytorium aplikacji przystankowej nie zostało zmodyfikowane.

## Stan weryfikacji

Zaimplementowany kod, działający generator i ukończone buildy biblioteki oraz aplikacji WWW. Lokalnie: strict TypeScript i 12 testów Vitest przeszły; benchmark 100 seedów zaakceptował 100 scen. Szczegóły w `reports/100-seeds.json`.

**Nie uznawaj projektu za wizualnie zaakceptowany wyłącznie na podstawie punktacji.** W pierwotnym środowisku Chromium kończył start sygnałem SIGTRAP, a lokalna Java nie uruchamiała się z powodu brakującego `libjli.so`. Testy WebGL i budowanie APK przeniesiono do GitHub Actions. Wynik ich konkretnego uruchomienia należy sprawdzić w zakładce Actions; samo istnienie workflow nie oznacza poprawnej kompilacji.

`reports/gallery.html` pokazuje pierwsze 20 kolejnych seedów, bez wybierania najlepszych zdjęć. Obecne pliki `offline-seed-*.jpg` są podglądami kompozycji z Pillow, **nie zrzutami WebGL**. Workflow przeglądarkowy generuje rzeczywiste zrzuty w `seed-*.png`.

## Uruchomienie Galaxy Lab

Wymagany Node.js 22.12+; używany i zalecany Node.js 24. Zasoby fotograficzne są dołączone w `packages/assets/textures`, więc do ich użycia nie potrzeba Pythona ani pobierania zdjęć.

```bash
npm ci
npm run dev
```

Otwórz `http://127.0.0.1:5173`. Podgląd na innym komputerze: `npm run dev -- --host 0.0.0.0`.

```bash
npm run build
```

Wynik: `dist/demo`. Pliki są statyczne i nadają się do WebView. Dla testowania wersji produkcyjnej podaj je przez lokalny serwer HTTP; nie otwieraj `index.html` przez `file://`, ponieważ ładowanie manifestu/modułów wymaga prawidłowego origin.

Tryb diagnostyczny: `/?seed=834721&scene=galaxy-showcase`. Wymuszony fallback: `/?fallback&seed=test`.

## Android APK

Projekt Android został wygenerowany przez Capacitor w `apps/android-test/android`. Id: `pl.galaxylab.engine5`; nazwa: Galaxy Lab; minimalny Android API 24, compile/target API 36. Obsługa sprzętowego renderowania, orientacji, aplikacji w tle oraz przycisku Wstecz jest zaimplementowana. Brak logowania i usług serwerowych.

Zainstaluj Android Studio 2025.2.1+, SDK API 36 i Build Tools 36.0.0. Wybierz JDK 21 (np. Temurin) dla Gradle. Na Windows użyj `gradlew.bat` w katalogu Androida zamiast `./gradlew`.

```bash
npm ci
npm run android:sync
npm run android:open
# lub z terminala:
npm run android:apk
```

APK: `apps/android-test/android/app/build/outputs/apk/debug/app-debug.apk`. Jest to debug APK z podpisem debug, przeznaczone do testów. Wszystkie tekstury i manifest są kopiowane do APK. Internet jest potrzebny przy pierwszej instalacji zależności/SDK, **nie podczas działania zainstalowanego Galaxy Lab**.

Workflow `.github/workflows/android.yml` uruchamia się po push na `main` i ręcznie przez `workflow_dispatch`. Po udanej kompilacji pobierz artefakt **Galaxy-Lab-debug-APK** z odpowiedniego uruchomienia Actions. Inne artefakty: biblioteka npm, benchmark, raport i zrzuty Playwright.

Nie wykonano testów na fizycznym Androidzie: WebView konkretnych telefonów, zużycie energii, temperatura, profiler GPU i długotrwały test pamięci wymagają urządzenia. Wykrywanie WebGL 2 następuje na urządzeniu przy inicjalizacji; bez niego działa ograniczony fotograficzny Canvas 2D. Nie ma założenia o dostępności rozszerzeń GPU. Program nie wymaga WebGPU, Unity, JNI ani natywnego OpenGL ES.

## Architektura

| Katalog | Odpowiedzialność |
| --- | --- |
| `packages/core/src` | GalaxyEngine, typy API, zdarzenia, kolejka operacji, cykl życia i zapisy |
| `packages/generator/src` | PRNG, typy scen, kandydaci, gwiazdy, konfiguracja i lokalna poprawa |
| `packages/composition/src` | Punktacja, ograniczenia, histogram referencji, luminance proxy i pamięć różnorodności |
| `packages/renderer/src` | PixiJS 8 WebGL 2, GLSL ES 3.00 gwiazd/meteorów i Canvas 2D fallback |
| `packages/assets` | 19 fotografii, 57 lokalnych wariantów WebP, maski i metadane |
| `packages/react/src` | useGalaxyEngine i GalaxyBackground; adapter klienta bez generatora w React |
| `apps/demo` | Galaxy Lab w HTML/CSS/TypeScript |
| `apps/android-test` | Konfiguracja Capacitor i wygenerowany projekt Gradle |
| `tools/image-processing` | Offline pobieranie, maskowanie, profile referencji i QA zasobów |
| `tools/benchmark` | 100 seedów, 20 podglądów oraz prawdziwe testy przeglądarki |
| `tests` | Testy deterministyczności, ograniczeń, meteorów i cyklu życia |

Technologie: TypeScript 5.9.3 strict, Vite 8.3.4, PixiJS 8.22.0, Capacitor 8.5.3, Vitest 5.0.4, Playwright 1.64.1. Wersje zależności zapisano w `package-lock.json`.

## API poza React

```ts
import { GalaxyEngine } from '@galaxy-engine/core';

const engine = new GalaxyEngine({
  container: document.getElementById('universe')!,
  assetBaseUrl: '/galaxy-assets/',
  quality: 'high',
  autoGenerate: true,
  sceneType: 'random',
  composition: { minScore: 85, candidates: 20 },
  meteors: { enabled: true, intensity: 'normal' },
  motion: { parallax: false, respectReducedMotion: true },
});
engine.on('sceneReady', scene => console.log(scene.seed, scene.score));
engine.on('renderError', error => console.error(error));
await engine.initialize(); // autoGenerate domyślnie tworzy scenę
engine.start();
```

Import modułu nie używa DOM ani WebGL. Dostęp do przeglądarki zaczyna się w `initialize()`. `container` musi mieć dodatnią szerokość i wysokość.

| Metoda | Działanie |
| --- | --- |
| `initialize(): Promise<void>` | Wczytuje lokalny manifest, inicjalizuje renderer; idempotentna |
| `start()`, `pause()`, `resume()`, `stop()` | Steruje animacjami; nie zmienia statycznej sceny |
| `destroy()` | Anuluje RAF, usuwa obserwatory/listenery, zwalnia tekstury i canvas |
| `generateUniverse(): Promise<UniverseScene>` | Nowy seed i wybór różnorodnej sceny |
| `generateFromSeed(seed): Promise<UniverseScene>` | Deterministyczne odtworzenie dla tej samej konfiguracji i wersji |
| `setQuality(profile): Promise<void>` | low / medium / high / ultra / auto; geometria pozostaje ta sama |
| `setSceneType(type)` | Ustawia rodzaj następnej generacji |
| `configure(patch)`, `getConfig()` | Kontroluje gwiazdy, galaktyki, planety, mgławice, wagi, limity i strefy UI |
| `setMeteorIntensity()`, `enableMeteors()`, `disableMeteors()` | Steruje osobnym modułem meteorów |
| `setMeteorSafeZones(zones)`, `triggerMeteor()` | Strefy zakazane i test animacji |
| `saveCurrentUniverse(): string` | Zapisuje scenę, pełną konfigurację, wersje i miniaturę; zwraca id |
| `loadSavedUniverse(id): Promise<UniverseScene>` | Przywraca dokładną zapisaną scenę, sprawdza wersje i ograniczenia |
| `listSavedUniverses()`, `rateSavedUniverse()`, `deleteSavedUniverse()` | Archiwum i oceny 1–5 |
| `restorePrevious(): Promise<UniverseScene>` | Powrót do poprzedniego układu |
| `getCurrentSeed()`, `getCurrentScore()`, `getCurrentScene()` | Metadane aktualnego wszechświata |
| `getPerformanceStats()`, `getLastCandidates()` | Statystyki i kandydaci |
| `showScene(scene): Promise<UniverseScene>` | Wyświetla zaakceptowanego kandydata z kompatybilnymi wersjami |
| `resize(width,height)`, `setAppActive(active)` | Rozmiar i natywny cykl życia |
| `on(event,callback)` | Subskrypcja; zwraca funkcję wyrejestrowania |

Zdarzenia: initialized, sceneGenerating, sceneReady, sceneChanged, qualityChanged, performanceWarning, renderError, contextLost, contextRestored.

Zapisy są lokalne (`localStorage`), maksymalnie 30 kompozycji. Pełne sceny zawierają gwiazdy, konfigurację i wersje. Przy braku miejsca wyjątek zapisu jest wyświetlany w Lab. Oceny nie modyfikują automatycznie wag; służą późniejszej kalibracji. Eksport JSON działa w przeglądarce; zachowanie pobierania pliku w konkretnym Android WebView wymaga weryfikacji na urządzeniu.

## Generator i punktacja

1. Seed jest hashowany FNV-1a; losowania używają Mulberry32. Osobne strumienie dla typu sceny, każdego kandydata, gwiazd i meteorów.
2. Tworzone jest 12–24 lekkich kandydatów (domyślnie 20). Zasoby nie są dekodowane dla każdego kandydata.
3. Oceniane są pozycje względem trójpodziału, kolizje, widoczność, masa wizualna, pokrycie, strefy UI oraz dane zdjęć.
4. Prosty hill climbing do czterech kroków poprawia pozycję głównego obiektu słabszych kandydatów.
5. Pięciu najlepszych kandydatów otrzymuje proxy 48×72 z rzeczywistych map luminancji zdjęć. Kontrolowane są kontrast i ciemna przestrzeń; histogram referencji pozostaje diagnostyką.
6. Najlepsza zaakceptowana scena otrzymuje pełne tekstury. Poprzedni obraz pozostaje do ukończenia ładowania, a przejście używa crossfade. W razie błędu poprzednia scena zostaje zachowana.

| Kryterium | Waga |
| --- | ---: |
| Kompozycja | 20 |
| Spójność przestrzeni | 15 |
| Naturalność | 15 |
| Równowaga | 10 |
| Główny obiekt | 10 |
| Czytelność interfejsu | 10 |
| Głębia | 10 |
| Harmonia kolorów | 5 |
| Pusta przestrzeń | 5 |

Wagi są konfigurowalne; wynik jest normalizowany do 100. Progi domyślne: minimum 85. Warunki krytyczne odrzucają brak zasobów, niezatwierdzoną maskę, nieprawidłową geometrię, przyciętą planetę, zasłonięty/poważnie przycięty punkt zainteresowania, duplikat głównego obiektu i przekroczony szacunkowy budżet tekstur.

Wykrywanie „naklejki” i piękna nie jest automatycznym dowodem jakości. Walidator geometryczny oraz analiza masek nie wykrywają wszystkich wad percepcyjnych. Referencja jest analizowana offline (histogramy, luminancja, kontrast, gradienty), nie ciężkim modelem AI. Ręczna ocena i prawdziwe zrzuty są niezbędne. To artystyczne kompozycje fotografii z różnymi skalami, nie fizyczna symulacja wspólnej lokalizacji obiektów astronomicznych.

Typy scen i prawdopodobieństwa: Galaxy Showcase 25%, Planetary Vista 20%, Nebula Landscape 20%, Deep Space 15%, Galaxy & Planet 15%, Cinematic Space 5%. Wartości można zmieniać przez `configure({sceneProbabilities: ...})`.

Deterministyczność zależy od **seeda + konfiguracji + aspect + wersji generatora i zdjęć**. Zmiana rozmiaru lub trybu UI nie uruchamia generatora; renderer zachowuje proporcje wygenerowanej przestrzeni. Przy zmianie orientacji fotografie pozostają w tej samej kompozycji, a wolne pasy mają kolor globalnego tła. Dla automatycznej generacji pamięć ostatnich ośmiu scen obniża ocenę podobnych nowych seedów. Jawne odtwarzanie seeda pomija tę pamięć, aby nie zmieniać wyniku.

## Fotografie i maskowanie

Galaktyki: M51, M101, NGC 1300, M104, NGC 3982. Mgławice: Carina, Orion, Eagle, Lagoon, Veil, Tarantula, NGC 3324 (Cosmic Cliffs). Planety: Saturn, Jupiter, Earth, Mars, Neptune, Venus, Uranus. Jest to początkowy katalog, nie pełny zestaw wszystkich obiektów wymienionych w pierwotnym briefie.

Źródła to oficjalne strony ESA/Hubble i ESA/Webb prezentujące obserwacje NASA/ESA/CSA oraz NASA dla Ziemi i Wenus. Pełne podpisy, adresy oryginałów i warunki użycia znajdują się w [ASSET-CREDITS.md](ASSET-CREDITS.md). Obrazy ESA mają CC BY 4.0; materiały NASA/JPL zachowują własne warunki. MIT dotyczy kodu, nie fotografii. Nie używamy logo NASA/ESA ani nie sugerujemy ich poparcia.

Fotografie mają lokalne warianty small/medium/large (do 768/1536/2560 px, bez powiększania oryginału). Maski używają estymacji czerni, szerokiego podparcia luminancji, ochrony ciemnych wnętrz, miękkiego wygaszania i alfa. Planety są **fotografiami z zachowanym oryginalnym oświetleniem**, bez dynamicznych faz/obrotu 3D. Pierścienie Saturna są częścią obserwacji, więc ich szczegóły i przesłanianie zachowuje zdjęcie. Nie stosujemy imitacji galaktyk SVG/CSS ani sztucznych kolorowych elips pierścieni.

Odtworzenie pipeline (tylko narzędzia offline):

```bash
python3 -m pip install -r tools/image-processing/requirements.txt
python3 tools/image-processing/download.py
npm run assets:prepare
python3 tools/image-processing/validate.py
```

Surowe fotografie można pobrać ponownie; nie są wymagane w runtime. Profil referencji jest zapisany w metadanych. Dla ponownej analizy własnej referencji ustaw `GALAXY_REFERENCE_IMAGE` na jej ścieżkę; obrazu referencyjnego nie publikujemy jako tapety ani zasobu silnika.

## Meteory i wydajność

Normalny odstęp 6–14 s, niski 20–35 s, wysoki 3–7 s, demonstracyjny 0,9–1,8 s. Czas życia 0,4–1,2 s. Shader GLSL ES 3.00 renderuje cienki ślad, głowę i poświatę, a osobny seeded PRNG zmienia kierunek, długość i prędkość. Testy stref sprawdzają odcinki trajektorii, preferując obszary poza jasnym obiektem. `prefers-reduced-motion` wyłącza meteory, migotanie i parallax.

Gwiazdy są generowane raz i trafiają do jednego bufora geometrycznego GPU. Jasne gwiazdy otrzymują minimalną separację; słabsze mają kontrolowane skupiska. Fotografie nie są przeliczane na CPU w każdej klatce. Statyczne geometrie i tekstury pozostają na GPU; nie stosujemy dodatkowego pełnoekranowego bufora statycznego, ponieważ kilka sprite'ów jest tańsze pamięciowo. Canvas fallback buforuje całe statyczne tło poza główną pętlą.

AUTO wykorzystuje liczbę wątków jako punkt startowy, a następnie rzeczywiste odstępy klatek, czas CPU i histerezę (minimum 15 s między zmianami, 4 s spowolnienia, 25 s stabilnej poprawy). Najpierw maleją rozdzielczość i liczba gwiazd; główna galaktyka zachowuje przynajmniej wariant medium. Profilowanie FPS na telefonie pozostaje konieczne. `frameMs` oznacza odstęp klatek, `cpuSubmitMs` koszt wysłania klatki przez JS; nie są to pomiary czasu GPU. Pamięć tekstur jest szacunkiem RGBA+mipmapy; draw calls są `null` zamiast zmyślonej liczby. Crossfade może chwilowo utrzymywać dwie sceny; szacunek i budżet nie obejmują pamięci sterownika/WebView.

## Galaxy Lab

Panel zawiera kontrolę seeda, rodzaju sceny, jakości, gwiazd, galaktyk, planet, mgławic i meteorów. „Czysty kosmos” ukrywa HUD. „Podgląd aplikacji” pokazuje wyszukiwarkę, filtry PKS/MPK, karty przystanków, oznaczenia linii, ulubione i nawigację. Przełącznik dodaje wyłącznie HTML; nie tworzy drugiego canvas ani nowego seeda. Strefy meteorów uwzględniają podgląd.

Composition Explorer pokazuje zapisane miniatury, seedy, wynik, oceny 1–5, odrzucanie i porównanie A/B. Zakładka kandydatów pokazuje pięć najlepszych propozycji. Generacyjne strefy czytelności definiuje `generator.safeZones`; zmiana podglądu nie przesuwa istniejących obiektów. Symulator nie jest implementacją rzeczywistego rozkładu jazdy.

## Biblioteka npm i React / Next.js

```bash
npm run build:engine
npm run pack:engine
# w oddzielnym projekcie:
npm install /path/galaxy-engine-core-5.0.0.tgz
npm install /path/galaxy-engine-react-5.0.0.tgz
```

Pakiety zawierają ESM i deklaracje TypeScript. Core zawiera także `assets/manifest.json`, tekstury i podpisy. Skopiuj `node_modules/@galaxy-engine/core/assets` do `public/galaxy-assets` swojej aplikacji. Nie kopiuj Galaxy Lab.

```tsx
'use client';
import { GalaxyBackground } from '@galaxy-engine/react';

export function AppBackground() {
  return <GalaxyBackground
    quality="high"
    sceneType="random"
    meteors
    assetBaseUrl="/galaxy-assets/"
    className="galaxy-background"
  />;
}
```

Użyj **jednej** instancji tła ponad układem dokumentu i pod interfejsem. Ustaw z-index tła na 0, a interfejsu na 1. Pokaż podpisy fotografii otrzymane przez `onSceneReady` oraz manifest; odpowiedzialność za atrybucję w aplikacji konsumującej bibliotekę pozostaje po stronie integracji.

Next.js, jeśli preferujesz dynamiczne ładowanie:

```tsx
'use client';
import dynamic from 'next/dynamic';
const GalaxyBackground = dynamic(
  () => import('@galaxy-engine/react').then(m => m.GalaxyBackground),
  { ssr: false }
);
```

Hook inicjalizuje silnik w efekcie, destruktor odmontowania zwalnia zasoby. Zmiana zwykłego renderu React nie generuje wszechświata. `sceneType` ustawia kolejną generację; do bezpośredniego generowania użyj `useGalaxyEngine()` i jego `engine`. Nie analizowano ani nie zakładano struktury komponentów głównej aplikacji.

## Testy

```bash
npm run typecheck
npm test
npm run benchmark
npx playwright install --with-deps chromium
npm run test:browser
```

Playwright sprawdza rzeczywisty WebGL 2, przełączanie UI bez zmiany sceny, orientację, zapisy, start/stop, reduced motion, kontekst, lokalność zasobów, Canvas fallback i sprzątanie canvas. Tworzy 20 zrzutów kolejnych seedów. Przy niedostępnym `WEBGL_lose_context` raport jawnie oznacza pominięcie. Testy cyklu życia Vitest korzystają z mocka renderera; nie udowadniają braku wycieków pamięci GPU. Długotrwały pomiar na telefonie i ocena estetyczna są nadal otwarte.

Licencja kodu: MIT. Fotografie: zobacz pełne warunki per zasób w ASSET-CREDITS.md.
