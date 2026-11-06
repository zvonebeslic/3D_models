# Logo Print Lab / 3D Models Lab

Repozitorij s postojećim **Full Vector** alatom i zasebnim **Logo Trace Studio** alatom za konture.

- [Full Vector – početna stranica](https://zvonebeslic.github.io/3D_models/)
- [Logo Trace Studio – ručno i automatsko praćenje](https://zvonebeslic.github.io/3D_models/trace.html)


### ULTRA DETAIL (studeni 2026.)

U Trace Studiju zadani način automatskog praćenja čuva izvorne piksele **1:1** (do 12 MP na mobilnim uređajima i 20 MP na računalu; iznad te granice treba isključiti 1:1 ili koristiti manji izvorni PNG). Početno pojednostavljenje i zaglađivanje postavljeni su na **0**, a unutarnji otvori uključeni su prema zadanim postavkama. Podaci iz prozirnog alfa-kanala koriste se izravno; za neprozirni JPEG i PNG s jednolikom pozadinom algoritam gradi kontinuirano polje razlike boja.

Novi dodatni prekidač **„Prati i unutarnje granice različitih boja“** dodaje vektorske linije između područja drukčijih boja. Zadano je isključen jer gradijenti, šum i kompresijski artefakti mogu proizvesti mnoštvo neželjenih linija. Granica je 300 000 unutarnjih segmenata po obradi; sustav javlja pogrešku ako je prijeđena i preporučuje povećanje praga.

U izvozu je preciznost koordinata povećana na šest decimalnih mjesta (korak zapisa 0,000001 u koordinatama slike), ali to **nije** tvrdnja da je geometrijska pogreška od izvornog loga manja od 0,000001 piksela. Točnost određuju rezolucija, antialiasing, kompresija, prozirnost, prag detekcije i geometrija izvornog rastera. Za apsolutno identične krivulje potreban je **izvorni vektorski logo** (SVG, AI, EPS ili PDF s vektorima), a ne rekonstrukcija iz piksela.


### Inteligentno uklapanje krivulja i pozadine (studeni 2026.)

Nakon prepoznavanja rubova, aktivirana je neovisna faza **adaptivnog prilagođavanja kubnih Bézierovih krivulja**. Krivulje se prilagođavaju sa zadanim odstupanjem od **0,65 px** u odnosu na izdvojene konture, uz višepikselno prepoznavanje oštrih kutova. To je geometrijska aproksimacija izdvojenog ruba i **nije** garancija podudaranja s nepoznatim izvornim vektorskim logotipom. Korisnik može isključiti opciju *Prepoznaj glatke krivulje i oštre kutove* kako bi usporedio sirove rubove piksela. SVG izvoz koristi istu geometriju kao prikaz.

**Uklanjanje nazubljenosti** primjenjuje blagi filtar na masku (ne na cijelu sliku), uz mogućnost potpunog isključivanja. **Dodirni boju pozadine** omogućuje ručni uzorak RGB boje za PNG/JPEG s neprozirnom podlogom umjesto nepouzdanog automatskog nagađanja iz kutova. Kod slike s transparentnošću već postojeći alfa-kanal ima prednost. Za nepravilne fotografske pozadine, gradijente i sjene i dalje će biti potrebna zasebna segmentacija ili ručna dorada.

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
node --check trace-fit.js
node --check trace-app.js
node --test tests/*.test.cjs
```

GitHub Actions pokreće ove provjere nakon relevantnih promjena.


## Full Vector v5: obnova siluete umjesto milijuna šumnih točaka

Nekadašnji algoritam je **uvijek** stvarao 48 skupina boja i neovisno ocrtavao piksele iz svake skupine. Na gotovo crnoj fotografiji s kompresijskim šumom to je stvaralo desetke tisuća SVG putanja, bijele točkice i nazubljene obrise.

Novi `fullvector.js` sada:
1. Najprije vektorizira **cjelovitu siluetu logotipa** iz maske vidljivosti (alfa-kanal kad postoji) kao jednu osnovnu SVG površinu, uz podpikselno nalaženje granica i prilagodbu Bézierovih krivulja.
2. Boje pronalazi iz **učestalih unutarnjih piksela**, ne iz najrjeđih ekstrema, pa slične tamne nijanse ne pretvara u zasebne oblike.
3. Pomoću podesivog uklanjanja šuma odbacuje usitnjene promjene boje unutar punih površina i čuva razmjerno velike obojene regije.
4. U SVG slojeve dodaje samo druge stvarne boje, dok transparentne unutarnje rupe ostaju otvorene zahvaljujući `fill-rule="evenodd"`.
5. Čuva stvarne `<path>` vektore, bez ugrađene rasterizirane slike.

Na početnoj stranici postoje dva podešavanja: maksimalan broj boja (1–16) i uklanjanje šuma (0–100%). To su izbori u **Full Vector** načinu rada, odvojeni od **Trace Studija**. Prejako uklanjanje šuma može izgubiti namjerno sitne detalje, a preslabo može sačuvati neželjenu kompresiju. Za najbolju vjernost koristi izvorni transparentni PNG.

Dodatno je popravljen postupak uklanjanja pozadine za neprozirni JPEG/PNG: cijeli rub slike više se ne označava automatski kao pozadina, jer bi to izbrisalo logotip koji dodiruje rub slike. Obrada i dalje ima ograničenja za fotografsku, šarenu ili neujednačenu pozadinu i ne može matematički rekonstruirati izgubljene detalje originalnog vektorskog dizajna.


## Postojeći Full Vector

`index.html`, `vector.js` i `fullvector.js` ostaju dostupni. Puni obojeni SVG generira se zasebno i predstavlja aproksimaciju boja iz rastera, ne matematički savršenu reprodukciju svakog izvornog piksela.

## Ostali dijelovi repozitorija

Eksperimentalni image-to-3D kod i lokalni AI server nalaze se u starijim datotekama i mapama. GitHub Pages hosta statički frontend; zahtjevni AI inference nije dio ovog Trace Studija.


## Full Vector v8 · segmentna analiza i uklanjanje mikroartefakata

Nadograđena je **postojeća početna stranica** (gumb FULL VECTOR SVG), ne samo izdvojeni Trace Studio.
Novi modul `vector-cleanup.js` najprije analizira povezane površine, uklanja odvojene mikro-otoke i zatvara samo male, potpuno **zatvorene** rupice. Rubni i veći otvoreni prostori ne diraju se. Po želji je moguće uključiti konzervativno popravljanje pojedinačnih sitnih udubljenja.

Svaki povezani segment se lokalno izdvaja iz očišćene maske, zajedno s pripadnom izvornom prozirnošću, a njegova se kontura može ponovno računati na interpoliranom 1×/2×/3× polju. Koordinate se zatim vraćaju u originalni sustav: **nema šavova između umjetnih pločica**. Za velike segmente sustav se automatski vraća na 1× radi memorije. Interpolacija ne stvara novu izvornu informaciju niti jamči geometrijsku točnost od 0,000001 px.

Korisnik može postaviti prag površine za uklanjanje odvojenih mrlja i zatvaranje minijaturnih rupa, kao i potpuno isključiti ULTRA čišćenje, kako bi zaštitio namjerno sitne elemente slova, interpunkcije i logotipa. Veliki otvori i oblici različitih boja imaju regresijske testove. SVG površine imaju vrlo tanku ispunu ruba iste boje (0,10 px) kako bi se smanjile anti-aliasing pukotine u preglednicima bez ugrađenog rastera.

## Full Vector v10 · pametno zaglađivanje nazubljenih rubova

Na početnoj stranici dodana je zasebna kontrola **Glatkoća rubova** (0–100%, zadano 65%). Prije skaliranja pojedinog segmenta i prije uklapanja Bézierovih krivulja obradi se njegova izvorna maska/prozirnost razdvojivim Gaussovim filtrom. Tako se ublažavaju kratke izbočine i rasterizacijske stepenice bez nametanja zamućenja cijeloj slici. Puna rezolucija i SVG koordinatni sustav ostaju nepromijenjeni. Potpuno **0%** isključuje novi filtar.

Kako bi se zaštitili **stvarni unutarnji otvori**, izvorne zatvorene prozirne površine nakon zaglađivanja ponovno se postavljaju na prozirnu vrijednost prije nalaženja konture. Pragovi za čišćenje malih rupa iz prethodne verzije i dalje su zasebne postavke: ako je prag rupa postavljen na nulu, ni jednopikselni unutarnji otvor neće biti automatski izbrisan.

Zaglađivanje zahtijeva uključeno **ULTRA čišćenje** i primjenjuje se i na granice višebojnih regija. Može blago zaobliti vrlo sitne kutove, zato su zadana 65% i prilagodljivi klizač namjerno kompromis. Nakon promjene postavke potrebno je ponovno kliknuti **FULL VECTOR SVG**. Ne obećava se oporavak geometrije izgubljene zbog kompresije/mutnog originala.



## Kontrola vjernosti SVG-a i automatsko podešavanje · Full Vector v14

Nakon što klikneš **FULL VECTOR SVG**, u kartici rezultata dostupna su dva nova postupka.

**Usporedi s originalom**: SVG se ponovno iscrta u transparentni raster i usporedi s očišćenim izvornim logom. Prikazuju se originalni logo, ponovno iscrtani SVG, karta promjena boja/prozirnosti i zasebna karta odstupanja rubova. Mjere se prosječna i maksimalna pogreška boja na skali 0–255, broj i postotak različitih piksela, prosječna udaljenost rubova te udio rubova udaljenih više od zadanog praga. Crvena boja na karti rubova označava promašen izvorni rub, a plava višak SVG ruba. Usporedba uzima u obzir i **unutarnje granice boja**, ne samo vanjsku siluetu.

Uspoređuje se **očišćeni original s uklonjenom pozadinom**, odnosno baš ono što Full Vector prima za obradu. To nije usporedba cijelog sirovog JPG-a s pozadinom. Boje potpuno prozirnih piksela ne stvaraju lažne pogreške. Za velike datoteke analiza je ograničena na najviše približno 700 000 uzorkovanih piksela. Rezultati jasno prikazuju stvarnu rezoluciju analize; konačni SVG ostaje izvorne veličine. Vizualni prikaz može se zumirati do 800%, a karta odstupanja rubova može se preuzeti kao PNG.

**Automatski pronađi najbolje postavke**: Novi modul vector-autotune.js isprobava do sedam konfiguracija Full Vector vektorizacije. Svaki probni SVG uspoređuje s istim izvornim logom uzimajući u obzir boje, prozirnost te vanjske i unutarnje rubove. Kandidati se rangiraju po ukupnoj izmjerenoj pogrešci, a pobjedničke se postavke primjenjuju na novu vektorizaciju originalne slike. Za brzinu na mobitelu probne konfiguracije koriste prikaz do oko 180 000 piksela, a završni se SVG računa u izvornoj rezoluciji. Ovo je **odabir među provjerenim konfiguracijama**, a ne samostalna rekonstrukcija izvornog dizajna ili dokaz savršene geometrije.

Oba su modula lokalna, bez slanja izvornog loga na vanjski poslužitelj. Ugrađeni vektorski eksport i njegova prethodna podešavanja ostaju dostupni. Node testovi provjeravaju potpuno prozirne RGB piksele, pomake vanjskih i unutarnjih rubova, očuvanje boja te spajanje UI kontrola.
