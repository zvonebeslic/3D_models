# Logo Print Lab / 3D Models Lab

Repozitorij s postojećim **Full Vector** alatom i zasebnim **Logo Trace Studio** alatom za konture.

- [Full Vector – početna stranica](https://zvonebeslic.github.io/3D_models/)
- [Logo Trace Studio – ručno i automatsko praćenje](https://zvonebeslic.github.io/3D_models/trace.html)


### ULTRA DETAIL (studeni 2026.)

Novi zadani način automatskog praćenja čuva izvorne piksele **1:1** (do 12 MP na mobilnim uređajima i 20 MP na računalu; iznad te granice treba isključiti 1:1 ili koristiti manji izvorni PNG). Početno pojednostavljenje i zaglađivanje postavljeni su na **0**, a unutarnji otvori uključeni su prema zadanim postavkama. Podaci iz prozirnog alfa-kanala koriste se izravno; za neprozirni JPEG i PNG s jednolikom pozadinom algoritam gradi kontinuirano polje razlike boja.

Novi dodatni prekidač **„Prati i unutarnje granice različitih boja“** dodaje vektorske linije između područja drukčijih boja. Zadano je isključen jer gradijenti, šum i kompresijski artefakti mogu proizvesti mnoštvo neželjenih linija. Granica je 300 000 unutarnjih segmenata po obradi; sustav javlja pogrešku ako je prijeđena i preporučuje povećanje praga.

U izvozu je preciznost koordinata povećana na šest decimalnih mjesta (korak zapisa 0,000001 u koordinatama slike), ali to **nije** tvrdnja da je geometrijska pogreška od izvornog loga manja od 0,000001 piksela. Točnost određuju rezolucija, antialiasing, kompresija, prozirnost, prag detekcije i geometrija izvornog rastera. Za apsolutno identične krivulje potreban je **izvorni vektorski logo** (SVG, AI, EPS ili PDF s vektorima), a ne rekonstrukcija iz piksela.

## Logo Trace Studio

**Način 1 / Ručno praćenje:** učitaj PNG, JPG ili WEBP i povlači prstom, mišem ili digitalnom olovkom preko slike. Potezi se bilježe u koordinatama slike, pojednostavljuju algoritmom Ramer–Douglas–Peucker, opcionalno zaglađuju kubnim Bézierovim krivuljama i postaju SVG putanje. Putanju je moguće odabrati, pomaknuti pojedinačne čvorove, zatvoriti, obrisati te poništiti ili vratiti do 40 promjena. Opcionalni **magnet uz rub** pri ručnom crtanju blago privlači potez na susjedne prijelaze boje ili prozirnosti.

**Način 2 / Automatska kontura:** vlastiti algoritam koristi prozirnost kad postoji ili određuje referentnu boju pozadine na rubovima i poplavnim ispunjavanjem uklanja samo povezan vanjski dio. Kontura se izvlači s interpolacijom položaja podpikselnih granica (marching squares), spaja u zatvorene putanje i pojednostavljuje. Unutarnje rupe opcionalno se prikazuju uz SVG even-odd ispunu.

**Izvoz:** SVG s vektorskim `path` elementima, bez `image`, data URI slike ili poziva vanjskom serveru. Konture mogu biti samo linije ili jednobojne ispunjene siluete, uz uzorak boje iz originalnog loga. Za **višebojni** logo i višebojne oblike koristi postojeći Full Vector alat na početnoj stranici. Jednobojna kontura ne može automatski sačuvati sve boje višebojnog logotipa.

### Preciznost i granice

- Najbolji ulaz: izvorni prozirni PNG/WEBP visoke rezolucije s jasnim rubovima.
- Na JPG-u s nepravilnom pozadinom potrebna je ručna dorada ili prethodno uklanjanje pozadine. Uniformna boja pozadine daje bolje rezultate.
- Slike veće od 2500 px po duljoj stranici ili 5 MP smanjuju se **samo radi analize**; korisnik je obaviješten, original ostaje netaknut. SVG se može neograničeno skalirati, ali preciznost njegovih kontura ograničena je kvalitetom izvornog rastera.
- Izvoz ručnih otvorenih poteza i dalje daje liniju, čak i kad je odabran stil „Ispunjeni oblici“.
- Nema gotovih ImageTracer/Potrace/segmentacijskih servisa niti slanja fotografija s uređaja.

### Testovi

```bash
node --check trace-core.js
node --check trace-app.js
node --test tests/trace-core.test.cjs
```

GitHub Actions pokreće ove provjere nakon relevantnih promjena.

## Postojeći Full Vector

`index.html`, `vector.js` i `fullvector.js` ostaju dostupni. Puni obojeni SVG generira se zasebno i predstavlja aproksimaciju boja iz rastera, ne matematički savršenu reprodukciju svakog izvornog piksela.

## Ostali dijelovi repozitorija

Eksperimentalni image-to-3D kod i lokalni AI server nalaze se u starijim datotekama i mapama. GitHub Pages hosta statički frontend; zahtjevni AI inference nije dio ovog Trace Studija.
