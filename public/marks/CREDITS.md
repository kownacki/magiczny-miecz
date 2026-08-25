# Znaczniki na kartach

Dwa oznaczenia, które mogą pojawić się na rogu obrazka karty: `trofeum.svg`
(pokonany Wróg, 1.4) i `granted.svg` (karta z trybu testowego).

Rysowane tak samo jak ikony pustych miejsc w `public/slots/` — jako maski CSS,
więc kształt bierze kolor tego, w czym stoi: ochra dla trofeum, czerwień dla
znacznika testowego. Emoji tego nie potrafi, bo niesie własne kolory, i to
właśnie było powodem tej zmiany.

W przeciwieństwie do ikon slotów te dwie są rysowane tutaj, nie pobrane —
pojedyncze czarne ścieżki na przezroczystym tle, w tym samym pudełku 512x512.
Nie wymagają więc żadnej atrybucji.
