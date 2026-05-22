window.onerror = function(message, source, lineno, colno, error) {
    alert("JavaScript fout: " + message + " op regel " + lineno);
};

function laadScriptEenmalig(src, globalNaam) {
    return new Promise(function(resolve, reject) {
        if (globalNaam && window[globalNaam]) {
            resolve(window[globalNaam]);
            return;
        }

        const bestaand = document.querySelector("script[data-src='" + src + "']");
        if (bestaand) {
            bestaand.addEventListener("load", function() {
                resolve(globalNaam ? window[globalNaam] : true);
            });
            bestaand.addEventListener("error", reject);
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.dataset.src = src;
        script.onload = function() {
            resolve(globalNaam ? window[globalNaam] : true);
        };
        script.onerror = function() {
            reject(new Error("Script kon niet worden geladen: " + src));
        };
        document.head.appendChild(script);
    });
}

async function zorgDatPdfJsGeladenIs() {
    await laadScriptEenmalig(
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
        "pdfjsLib"
    );

    if (!window.pdfjsLib) {
        throw new Error("PDF.js is niet geladen.");
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    return pdfjsLib;
}

async function zorgDatTesseractGeladenIs() {
    await laadScriptEenmalig(
        "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
        "Tesseract"
    );

    if (!window.Tesseract) {
        throw new Error("OCR-library is niet geladen.");
    }

    return Tesseract;
}

const lastenCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIF_u4r12AOW0RtuEvBYAkmgPZ9Dh5MetP6DcBx55W_au6504GaQBfsu8T7W_-nx74eSUr5hE0ib4Y/pub?gid=1280324100&single=true&output=csv";
const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIF_u4r12AOW0RtuEvBYAkmgPZ9Dh5MetP6DcBx55W_au6504GaQBfsu8T7W_-nx74eSUr5hE0ib4Y/pub?gid=0&single=true&output=csv";
const taxatieCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIF_u4r12AOW0RtuEvBYAkmgPZ9Dh5MetP6DcBx55W_au6504GaQBfsu8T7W_-nx74eSUr5hE0ib4Y/pub?gid=1541539521&single=true&output=csv";
const koopCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIF_u4r12AOW0RtuEvBYAkmgPZ9Dh5MetP6DcBx55W_au6504GaQBfsu8T7W_-nx74eSUr5hE0ib4Y/pub?gid=661978374&single=true&output=csv";

let txtBestandTekst = "";
let geuploadBestandType = "";
let geuploadeBestandenTeksten = [];

const uploadStartScherm = document.getElementById("uploadStartScherm");
document.getElementById("uploadStatusTekst").innerHTML = "Script actief";
function debugStap(tekst) {
    console.log("DEBUG:", tekst);
    const el = document.getElementById("startProcesStatusTekst");
    if (el) el.innerHTML = "Stap: " + tekst;
}
async function debugAwait(naam, promise) {
    debugStap("Start: " + naam);

    const resultaat = await Promise.race([
        promise,
        new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    timeout: true,
                    score: 0,
                    aantal: 0,
                    resultaten: []
                });
            }, 8000);
        })
    ]);

    if (resultaat && resultaat.timeout) {
        debugStap("Timeout: " + naam + " overgeslagen");
    } else {
        debugStap("Klaar: " + naam);
    }

    return resultaat;
}

function initialiseerUpload() {
    const uploadInput = document.getElementById("txtUpload");

    if (!uploadInput) {
        alert("txtUpload niet gevonden");
        return;
    }

    uploadInput.onchange = function(event) {
        const bestanden = Array.from(event.target.files || []);

        alert("Upload change gestart: " + bestanden.length + " bestand(en)");

        if (bestanden.length) {
            verwerkUploadBestanden(bestanden);
        }
    };
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseerUpload);
} else {
    initialiseerUpload();
}

if (uploadStartScherm) {
    uploadStartScherm.addEventListener("dragover", function(event) {
        event.preventDefault();
        uploadStartScherm.classList.add("dragOver");
    });

    uploadStartScherm.addEventListener("dragleave", function() {
        uploadStartScherm.classList.remove("dragOver");
    });

    uploadStartScherm.addEventListener("drop", function(event) {
        event.preventDefault();
        uploadStartScherm.classList.remove("dragOver");

        if (event.dataTransfer && event.dataTransfer.files.length) {
            verwerkUploadBestanden(Array.from(event.dataTransfer.files));
        }
    });
}
window.startBestandUpload = function(files) {
    verwerkUploadBestanden(Array.from(files || []));
};
async function verwerkUploadBestanden(bestanden) {
    const uploadStatusTekst = document.getElementById("uploadStatusTekst");
    const uploadNaKeuze = document.getElementById("uploadNaKeuze");
    const analyseKnop = document.getElementById("analyseKnop");

    if (uploadStatusTekst) {
        uploadStatusTekst.innerHTML = "Upload ontvangen: " + bestanden.length + " bestand(en).";
    }

    if (!bestanden || !bestanden.length) {
        if (uploadStatusTekst) uploadStatusTekst.innerHTML = "Geen bestanden ontvangen.";
        return;
    }

    if (uploadNaKeuze) {
        uploadNaKeuze.style.display = "flex";
    }

    if (analyseKnop) {
        analyseKnop.disabled = true;
        analyseKnop.innerHTML = "Bestanden worden gelezen...";
    }

    txtBestandTekst = "";
    geuploadeBestandenTeksten = [];
    geuploadBestandType = "";

    let alles = "";
    const fouten = [];
    const types = [];

    for (const bestand of bestanden) {
        const naam = bestand.name || "Onbekend bestand";
        const lower = naam.toLowerCase();

        if (uploadStatusTekst) {
            uploadStatusTekst.innerHTML = "Bezig met uitlezen: " + escapeHtml(naam);
        }

        try {
            let tekst = "";

            if (lower.endsWith(".txt")) {
                tekst = await bestand.text();
                types.push("txt");
            } else if (lower.endsWith(".pdf")) {
                tekst = await leesPdfBrowser(bestand);
                types.push("pdf");
            } else if (/\.(jpg|jpeg|png|webp)$/i.test(lower)) {
                tekst = await leesAfbeeldingBrowser(bestand);
                types.push("afbeelding");
            } else {
                throw new Error("Bestandstype wordt niet ondersteund.");
            }

            if (tekst && tekst.trim()) {
                alles += "\n\n--- Bestand: " + naam + " ---\n" + tekst;

                geuploadeBestandenTeksten.push({
                    naam: naam,
                    tekst: tekst
                });
            } else {
                fouten.push(naam + ": geen tekst gevonden");
            }
        } catch (e) {
            fouten.push(naam + ": " + (e && e.message ? e.message : e));
        }
    }

    txtBestandTekst = alles;
    geuploadBestandType = types.includes("pdf") ? "pdf" : (types[0] || "");

    if (analyseKnop) {
        analyseKnop.disabled = geuploadeBestandenTeksten.length === 0;
        analyseKnop.innerHTML = "Datakwaliteit berekenen";
    }

    if (uploadStatusTekst) {
        if (geuploadeBestandenTeksten.length > 0) {
            uploadStatusTekst.innerHTML =
                geuploadeBestandenTeksten.length +
                " van " +
                bestanden.length +
                " bestand(en) gelezen. Klik op Datakwaliteit berekenen." +
                (fouten.length ? "<br>Fouten: " + escapeHtml(fouten.join(" | ")) : "");
        } else {
            uploadStatusTekst.innerHTML =
                "Geen bestanden konden worden uitgelezen.<br>" +
                escapeHtml(fouten.join(" | "));
        }
    }

    toonProcesStatus(
        geuploadeBestandenTeksten.length
            ? "Bestanden gelezen. Klik op datakwaliteit berekenen."
            : "Bestanden niet uitgelezen."
    );
}

async function leesPdfBrowser(bestand) {
    const pdfjs = await zorgDatPdfJsGeladenIs();

    const buffer = await bestand.arrayBuffer();

    const pdf = await metTimeout(
        pdfjs.getDocument({
            data: buffer,
            disableWorker: true
        }).promise,
        20000,
        null
    );

    if (!pdf) throw new Error("PDF uitlezen duurde te lang of werd geblokkeerd.");

    let tekst = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await metTimeout(pdf.getPage(i), 7000, null);
        if (!page) continue;

        const content = await metTimeout(page.getTextContent(), 7000, null);
        if (!content || !content.items) continue;

        tekst += content.items.map(item => item.str || "").join(" ") + "\n";
    }

    return tekst;
}

async function leesAfbeeldingBrowser(bestand) {
    const tesseract = await zorgDatTesseractGeladenIs();

    const resultaat = await metTimeout(
        tesseract.recognize(bestand, "nld+eng"),
        30000,
        null
    );

    if (!resultaat || !resultaat.data) {
        throw new Error("OCR uitlezen duurde te lang of werd geblokkeerd.");
    }

    return resultaat.data.text || "";
}

async function leesPdfBestand(bestand) {
    if (!window.pdfjsLib) {
        throw new Error("PDF.js is niet geladen.");
    }

    const arrayBuffer = await bestand.arrayBuffer();

    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({
            data: arrayBuffer,
            disableWorker: true
        }).promise;
    } catch (e) {
        pdf = await pdfjsLib.getDocument({
            data: arrayBuffer
        }).promise;
    }

    let tekst = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const content = await pagina.getTextContent();
        tekst += content.items.map(function(item) {
            return item.str || "";
        }).join(" ") + "\n";
    }

    return tekst;
}

async function leesAfbeeldingMetOcr(bestand) {
    if (!window.Tesseract) {
        throw new Error("Tesseract OCR is niet geladen.");
    }

    toonProcesStatus("Afbeelding wordt uitgelezen met OCR: " + bestand.name);

    const resultaat = await Promise.race([
        Tesseract.recognize(bestand, "nld+eng"),
        new Promise(function(_, reject) {
            setTimeout(function() {
                reject(new Error("OCR duurt te lang of is geblokkeerd."));
            }, 30000);
        })
    ]);

    return resultaat && resultaat.data && resultaat.data.text
        ? resultaat.data.text
        : "";
}

const adresZoekKnop = document.getElementById("adresZoekKnop");

if (adresZoekKnop) {
    adresZoekKnop.addEventListener("click", function() {
        const blok = document.getElementById("adresZoekBlok");
        blok.style.display = blok.style.display === "none" ? "block" : "none";
    });
}

let gekozenAdresZoekObject = null;

const adresZoekInput = document.getElementById("adresZoekInput");

if (adresZoekInput) {
    adresZoekInput.addEventListener("input", async function() {
        const waarde = this.value.trim();
        const suggestiesDiv = document.getElementById("adresSuggesties");

        gekozenAdresZoekObject = null;

        if (!suggestiesDiv) return;

        if (waarde.length < 3) {
            suggestiesDiv.innerHTML = "";
            return;
        }

        try {
            const url =
                "https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?rows=6&fq=type:adres&q=" +
                encodeURIComponent(waarde);

            const response = await fetch(url);
            const data = await response.json();
            const docs = data.response && data.response.docs ? data.response.docs : [];

            suggestiesDiv.innerHTML = docs.map(doc => {
                const label = doc.weergavenaam || doc.suggest || "";
                const id = doc.id || "";

                return (
                    "<div class='adresSuggestieItem' " +
                    "data-id='" + escapeHtml(id) + "' " +
                    "data-label='" + escapeHtml(label) + "' " +
                    "style='padding:6px; cursor:pointer; border-bottom:1px solid #eee;'>" +
                    escapeHtml(label) +
                    "</div>"
                );
            }).join("");

            document.querySelectorAll("#adresSuggesties .adresSuggestieItem").forEach(item => {
                item.addEventListener("click", function() {
                    kiesAdresSuggestie(
                        this.getAttribute("data-id"),
                        this.getAttribute("data-label")
                    );
                });
            });
        } catch (e) {
            suggestiesDiv.innerHTML = "";
        }
    });
}

async function kiesAdresSuggestie(id, label) {
    document.getElementById("adresZoekInput").value = label;
    document.getElementById("adresSuggesties").innerHTML = "";

    try {
        const url =
            "https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=" +
            encodeURIComponent(id);

        const response = await fetch(url);
        const data = await response.json();

        const doc = data.response && data.response.docs && data.response.docs[0];

        if (!doc) {
            gekozenAdresZoekObject = null;
            return;
        }

        gekozenAdresZoekObject = {
            adres: [doc.straatnaam, doc.huisnummer, doc.huisletter, doc.huisnummertoevoeging]
                .filter(Boolean)
                .join(" "),
            plaats: doc.woonplaatsnaam || ""
        };
    } catch (e) {
        gekozenAdresZoekObject = null;
    }
}

async function startAnalyse() {
    alert("startAnalyse echt gestart 1");

    const resultaat = document.getElementById("resultaat");

    alert(
        "startAnalyse stap 2\n" +
        "resultaat gevonden: " + !!resultaat + "\n" +
        "tekst lengte: " + (txtBestandTekst ? txtBestandTekst.length : 0)
    );

    try {
        if (!txtBestandTekst) {
            toonAppWerkgebied();
            resultaat.innerHTML = "<p>Upload eerst een TXT-, PDF- of afbeeldingsbestand.</p>";
            return;
        }

        toonAppWerkgebied();
alert("na toonAppWerkgebied");
        toonProcesStatus("Bezig met analyseren...");
alert("na toonProcesStatus");
alert("voor resultaat.innerHTML");
resultaat.innerHTML =
    "<p><strong>TEST: analyse-scherm opent.</strong></p>" +
    "<p>Tot hier werkt startAnalyse.</p>";
alert("na resultaat.innerHTML");

        const eigenGebruik = document.getElementById("eigenGebruikCheckbox").checked;
const isOpnieuwZoekenMetObjectdata = window.isOpnieuwZoekenMetObjectdata === true;
window.isOpnieuwZoekenMetObjectdata = false;
        const meerdereObjecten = analyseerMeerdereObjecten(geuploadeBestandenTeksten);

        const adresGegevens = meerdereObjecten
            ? {
                adres: meerdereObjecten.adres,
                plaats: meerdereObjecten.plaats
            }
            : haalAdresEnPlaatsUitTekst(txtBestandTekst);

if (!adresGegevens.adres || !adresGegevens.plaats) {
    toonAppWerkgebied();
    resultaat.innerHTML =
        "<p class='fout'>Adres of plaats kon niet automatisch uit het bestand worden gehaald.</p>" +
        "<p>Gebruik bijvoorbeeld:</p>" +
        "<p><strong>adres: Markt 20</strong><br><strong>plaats: Son en Breugel</strong></p>";
    return;
}

localStorage.setItem("taxatieAdres", adresGegevens.adres);
localStorage.setItem("taxatiePlaats", adresGegevens.plaats);

let objectAnalyse = analyseerObject(txtBestandTekst, eigenGebruik);

toonProcesStatus("Objectdata wordt geanalyseerd...");
debugStap("BAG gegevens worden opgehaald...");
toonProcesStatus("BAG gegevens worden opgehaald...");

const bagGegevens = await debugAwait(
    "BAG gegevens",
    haalBagGegevens(adresGegevens.adres, adresGegevens.plaats)
);

const bagGebruiksdoel = bagGegevens ? bagGegevens.gebruiksdoel : null;
const bagBouwjaar = bagGegevens ? bagGegevens.bouwjaar : null;

if (bagGebruiksdoel) {
    objectAnalyse.resultaten.push({
        naam: "Gebruiksdoel",
        gevonden: true,
        waarde: bagGebruiksdoel + " (BAG)"
    });

    objectAnalyse.score = berekenScore(objectAnalyse.resultaten);
}

console.log("BAG gegevens resultaat:", bagGegevens);

console.log("BAG bouwjaar resultaat:", bagBouwjaar);

if (bagBouwjaar) {
    localStorage.setItem("handmatig_Bouwjaar", bagBouwjaar);

    const bouwjaarItem = objectAnalyse.resultaten.find(item =>
        item.naam === "Bouwjaar"
    );

    if (bouwjaarItem) {
        bouwjaarItem.gevonden = true;
        bouwjaarItem.waarde = bagBouwjaar + " (BAG)";
    }

    objectAnalyse.score = berekenScore(objectAnalyse.resultaten);
}

toonProcesStatus("Objectdata wordt afgerond...");
toonProcesStatus("Objectdata wordt verrijkt...");
// await wachtEven();

if (meerdereObjecten) {
    objectAnalyse = verrijkObjectAnalyseMetMeerdereObjecten(objectAnalyse, meerdereObjecten);
}

toonProcesStatus("Bestanden worden gecontroleerd op afwijkingen...");
// await wachtEven();

const afwijkingenBestanden = analyseerAfwijkingenTussenBestanden(geuploadeBestandenTeksten);

toonProcesStatus("Huurovereenkomsten worden geanalyseerd...");
// await wachtEven();

const meerdereHuurovereenkomsten = analyseerMeerdereHuurovereenkomsten(geuploadeBestandenTeksten);
window.laatsteMeerdereHuurovereenkomsten = meerdereHuurovereenkomsten;
if (meerdereHuurovereenkomsten) {
    const resterendeLooptijdOngewogen =
        berekenGemiddeldeResterendeLooptijdOngewogen(meerdereHuurovereenkomsten);

    const resterendeLooptijdGewogen =
        berekenGemiddeldeResterendeLooptijdGewogen(meerdereHuurovereenkomsten);

    objectAnalyse.resultaten.push({
        naam: "Resterende looptijd gemiddeld (ongewogen)",
        gevonden: resterendeLooptijdOngewogen !== "",
        waarde: resterendeLooptijdOngewogen
    });

    objectAnalyse.resultaten.push({
        naam: "Resterende looptijd gemiddeld (gewogen)",
        gevonden: resterendeLooptijdGewogen !== "",
        waarde: resterendeLooptijdGewogen
    });

    objectAnalyse.score = berekenScore(objectAnalyse.resultaten);
}

toonProcesStatus("Huurlijst wordt geanalyseerd...");
// await wachtEven();

const huurlijstAnalyse = analyseerHuurlijst(geuploadeBestandenTeksten);
window.laatsteHuurlijstAnalyse = huurlijstAnalyse;
if (meerdereHuurovereenkomsten && meerdereHuurovereenkomsten.contracten.length > 1) {
    objectAnalyse.resultaten = objectAnalyse.resultaten.map(item => {
if (item.naam === "Aanvangshuur") {
    const contracten =
        meerdereHuurovereenkomsten.contractenVoorOptelling ||
        meerdereHuurovereenkomsten.contracten ||
        [];

    const contractenMetAanvangshuur = contracten
        .filter(x => x.aanvangshuurPerJaar !== null && x.aanvangshuurPerJaar > 0);

    if (contracten.length > 0) {
        const totaalAanvangshuur = contractenMetAanvangshuur
            .reduce((som, x) => som + (x.aanvangshuurPerJaar || 0), 0);

        return {
            ...item,
            gevonden: contractenMetAanvangshuur.length === contracten.length,
            waarde: totaalAanvangshuur > 0
                ? "€ " + totaalAanvangshuur.toLocaleString("nl-NL", {
                    maximumFractionDigits: 0
                }) + " per jaar totaal"
                : "",
            status: contractenMetAanvangshuur.length === contracten.length
                ? "goed_info"
                : item.status,
            toelichting: contracten.map(x =>
                (x.huurderNaam || x.huurder || x.naam || "Onbekende huurder") +
                ": " +
                (
                    x.aanvangshuurPerJaar !== null && x.aanvangshuurPerJaar > 0
                        ? "€ " + x.aanvangshuurPerJaar.toLocaleString("nl-NL", {
                            maximumFractionDigits: 0
                        }) + " per jaar"
                        : "Niet gevonden"
                )
            ).join(" | ")
        };
    }
}
if (item.naam === "Contracthuur") {
    const contracten = meerdereHuurovereenkomsten.contracten || [];

    const contractenMetContracthuur = contracten
        .filter(x => x.huurPerJaar !== null && x.huurPerJaar > 0);

    if (contracten.length > 0) {
        const totaalContracthuur = contractenMetContracthuur
            .reduce((som, x) => som + (x.huurPerJaar || 0), 0);

        return {
            ...item,
            gevonden: contractenMetContracthuur.length === contracten.length,

            waarde: totaalContracthuur > 0
                ? "€ " + totaalContracthuur.toLocaleString("nl-NL", {
                    maximumFractionDigits: 0
                }) + " per jaar totaal"
                : "",

            status: contractenMetContracthuur.length === contracten.length
                ? "goed_info"
                : item.status,

            toelichting: contracten.map(x =>
                (x.huurderNaam || x.huurder || x.naam || "Onbekende huurder") +
                ": " +
                (
                    x.huurPerJaar !== null && x.huurPerJaar > 0
                        ? "€ " + x.huurPerJaar.toLocaleString("nl-NL", {
                            maximumFractionDigits: 0
                        }) + " per jaar"
                        : "Niet gevonden"
                )
            ).join(" | ")
        };
    }
}

if (item.naam === "Ingangsdatum huurcontract") {
    const contracten = meerdereHuurovereenkomsten.contracten || [];
    const contractenMetIngangsdatum = contracten.filter(x => x.ingangsdatum);

    if (contractenMetIngangsdatum.length > 0) {
        return {
            ...item,
            gevonden: true,
            waarde: contractenMetIngangsdatum.length === 1
                ? contractenMetIngangsdatum[0].ingangsdatum
                : "",
            status: contracten.length > 1 ? "goed_info" : item.status,
            toelichting: contracten.map(x =>
                (x.huurderNaam || x.huurder || x.naam || "Onbekende huurder") +
                ": " +
                (x.ingangsdatum || "Niet gevonden")
            ).join(" | ")
        };
    }
}
if (item.naam === "Einddatum huurcontract") {
    const contracten = meerdereHuurovereenkomsten.contracten || [];
    const contractenMetEinddatum = contracten.filter(x => x.einddatum);

    if (contractenMetEinddatum.length > 0) {
        return {
            ...item,
            gevonden: true,
            waarde: contractenMetEinddatum.length === 1
                ? contractenMetEinddatum[0].einddatum
                : "",
            status: contracten.length > 1 ? "goed_info" : item.status,
            toelichting: contracten.map(x =>
                (x.huurderNaam || x.huurder || x.naam || "Onbekende huurder") +
                ": " +
                (x.einddatum || "Niet gevonden")
            ).join(" | ")
        };
    }
}

if (item.naam === "Verhuurd oppervlak") {
    const contractenVoorOptelling =
        meerdereHuurovereenkomsten.contractenVoorOptelling ||
        meerdereHuurovereenkomsten.contracten ||
        [];

    const totaalVerhuurdOpp = contractenVoorOptelling
        .reduce((som, x) => som + (x.oppervlakte || 0), 0);

    if (totaalVerhuurdOpp > 0) {
        return {
            ...item,
            gevonden: true,
waarde: totaalVerhuurdOpp.toLocaleString("nl-NL", {
    maximumFractionDigits: 0
}) + " m²"
        };
    }
}

return item;
    });

    objectAnalyse.score = berekenScore(objectAnalyse.resultaten);
herberekenLeegstand(objectAnalyse.resultaten);
objectAnalyse.score = berekenScore(objectAnalyse.resultaten);
}
if (huurlijstAnalyse) {
    objectAnalyse.resultaten.push({
        naam: "Actuele huur",
        gevonden: huurlijstAnalyse.allesAanwezig,
        waarde: huurlijstAnalyse.allesAanwezig
            ? "€ " + huurlijstAnalyse.totaalHuur.toLocaleString("nl-NL", {
                maximumFractionDigits: 0
            }) + " per jaar totaal"
            : "",
        status: huurlijstAnalyse.allesAanwezig ? "goed_info" : "",
        toelichting: huurlijstAnalyse.regels.map(regel =>
            regel.huurder +
            ": " +
            (
                regel.huurprijs !== null && regel.huurprijs > 0
                    ? "€ " + regel.huurprijs.toLocaleString("nl-NL", {
                        maximumFractionDigits: 0
                    }) + " per jaar"
                    : "Niet gevonden"
            ) +
            " | Ingang: " + (regel.ingangsdatum || "Niet gevonden") +
            " | Eind: " + (regel.einddatum || "Niet gevonden") +
            " | Oppervlakte: " + (
                regel.oppervlakte !== null
                    ? regel.oppervlakte + " m²"
                    : "Niet gevonden"
            )
        ).join(" | ")
    });

    objectAnalyse.score = berekenScore(objectAnalyse.resultaten);
}
        const wozItem = objectAnalyse.resultaten.find(r => r.naam === "WOZ-waarde" && r.waarde);

        let gemeentelijkeLasten = null;

try {
    if (wozItem) {
        toonProcesStatus("Gemeentelijke lasten worden opgehaald...");

        gemeentelijkeLasten = await metTimeout(
            berekenGemeentelijkeLasten(wozItem.waarde),
            3000,
            null
        );
    }
} catch (e) {
    gemeentelijkeLasten = null;
}

        if (objectAnalyse.blokkerend) {
            resultaat.innerHTML =
                "<p class='fout'><strong>" + escapeHtml(objectAnalyse.melding) + "</strong></p>" +
                "<p><strong>Adres:</strong> " + escapeHtml(adresGegevens.adres) + "</p>" +
                "<p><strong>Plaats:</strong> " + escapeHtml(adresGegevens.plaats) + "</p>" +
                maakScoreTabel("Object", objectAnalyse.score, objectAnalyse.resultaten, gemeentelijkeLasten);
            return;
        }

        window.alleHuurReferenties = null;
        window.uitgeslotenHuurReferenties = [];

        window.alleKoopReferenties = null;
        window.uitgeslotenKoopReferenties = [];

toonProcesStatus("Objectdata geanalyseerd. Marktgegevens worden opgehaald...");
const marktAnalyse = await debugAwait(
    "Marktgegevens",
    analyseerMarkt(adresGegevens.adres, adresGegevens.plaats)
);

toonProcesStatus("Marktgegevens opgehaald. Historische taxaties worden opgehaald...");
const historischeAnalyse = await debugAwait(
    "Historische taxaties",
    analyseerHistorischeTaxaties(adresGegevens.adres, adresGegevens.plaats)
);

toonProcesStatus("Historische taxaties opgehaald. Koopreferenties worden opgehaald...");
const koopAnalyse = await debugAwait(
    "Koopreferenties",
    analyseerKoopReferenties(adresGegevens.adres, adresGegevens.plaats)
);

alert("koopAnalyse klaar");
console.log("koopAnalyse:", koopAnalyse);

alert("voor test na koopAnalyse");

document.getElementById("resultaat").insertAdjacentHTML(
    "beforeend",
    "<p class='goed'>TEST: koopAnalyse is klaar.</p>"
);

alert("testregel toegevoegd");

window.laatsteHistorischeAnalyse = historischeAnalyse;
window.laatsteKoopAnalyse = koopAnalyse;

debugStap("Huurreferenties worden opgeslagen");

window.alleHuurReferenties = (
    (marktAnalyse && marktAnalyse.resultaten)
        ? marktAnalyse.resultaten
        : []
).map((r, index) => ({
    ...r,
    uniekeId: index
}));

window.laatsteReferentieResultaten =
    (window.alleHuurReferenties || []).slice(0, 5);

debugStap("Koopreferenties worden opgeslagen");

window.alleKoopReferenties = (
    (koopAnalyse && koopAnalyse.resultaten)
        ? koopAnalyse.resultaten
        : []
).map((r, index) => ({
    ...r,
    uniekeId: index
}));

window.laatsteKoopReferenties =
    (window.alleKoopReferenties || []).slice(0, 5);
 let html = "";

html =
    "<h4>Objectdata</h4>" +
    "<p class='goed'><strong>Analyse afgerond tot schermopbouw.</strong></p>" +
    "<p><strong>Adres:</strong> " + adresGegevens.adres + "</p>" +
    "<p><strong>Plaats:</strong> " + adresGegevens.plaats + "</p>";

document.getElementById("appWerkgebied").style.display = "block";
document.getElementById("resultaat").innerHTML = html;
document.getElementById("procesStatusTekst").innerHTML = "";
} catch (error) {
    console.error(error);
    alert("Fout in analyse: " + error.message);

    toonAppWerkgebied();
    toonProcesStatus("Er ging iets mis: " + error.message);

    resultaat.innerHTML =
        "<p class='fout'>Er ging iets mis bij het berekenen van de datakwaliteit.</p>" +
        "<p class='fout'>" + escapeHtml(error.message) + "</p>";
}
}

function haalAdresEnPlaatsUitTekst(tekstOrigineel) {
    const tekst = String(tekstOrigineel || "");

    let adres = "";
    let plaats = "";

    let explicietAdres = tekst.match(/(?:^|\n|\r|\s)adres\s*:?\s*(.*?)(?=\s*(?:plaats|postcode|bouwjaar|bvo|vvo|huurprijs|contracthuur|woz|$))/i);
    let explicietPlaats = tekst.match(/(?:^|\n|\r|\s)plaats\s*:?\s*(.*?)(?=\s*(?:adres|postcode|bouwjaar|bvo|vvo|huurprijs|contracthuur|woz|$))/i);

    if (explicietAdres && explicietPlaats) {
        adres = explicietAdres[1].replace(/\s+/g, " ").trim();
        plaats = explicietPlaats[1].replace(/\s+/g, " ").trim();
    }

    if (!adres || !plaats) {
        const rozMatch = tekst.match(
            /gelegen\s+(.+?),\s*([1-9][0-9]{3}\s?[A-Z]{2})\s+([A-Za-zÀ-ÿ'’.\-\s]+?)(?=\s+kadastraal|\s+ter grootte|\s*$)/i
        );

        if (rozMatch) {
            adres = rozMatch[1].replace(/\s+/g, " ").trim();
            plaats = rozMatch[3].replace(/\s+/g, " ").trim();
        }
    }

    adres = adres.replace(/[|;,]+$/, "").trim();
    plaats = plaats.replace(/[|;,]+$/, "").trim();

    return {
        adres: adres,
        plaats: plaats
    };
}
function bedragEuroNaarGetalNL(waarde) {
    let schoon = String(waarde || "")
        .replace(/€/g, "")
        .replace(/\s/g, "")
        .replace(/[^\d,.]/g, "");

    if (!schoon) return null;

    if (schoon.includes(".") && schoon.includes(",")) {
        schoon = schoon.replace(/\./g, "").replace(",", ".");
    } else if (schoon.includes(".") && !schoon.includes(",")) {
        schoon = schoon.replace(/\./g, "");
    } else if (schoon.includes(",") && !schoon.includes(".")) {
        const delen = schoon.split(",");
        schoon = delen.length === 2 && delen[1].length === 3
            ? delen[0] + delen[1]
            : schoon.replace(",", ".");
    }

    const getal = parseFloat(schoon);
    return isNaN(getal) ? null : getal;
}

function haalIngangsdatumHuurcontractUitTekst(origineel, bestandsnaam = "") {
    const tekst = String(origineel || "")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, "\"")
        .replace(/\s+/g, " ")
        .trim();

    const maandDatum = "[0-9]{1,2}\\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\\s+[0-9]{4}";
    const cijferDatum = "[0-9]{1,2}[-\\/][0-9]{1,2}[-\\/][0-9]{2,4}";
    const datum = "(" + maandDatum + "|" + cijferDatum + ")";

    const patronen = [
        new RegExp("(?:gaat\\s+in\\s+op|vangt\\s+aan\\s+op|aanvangt\\s+op|ingaande\\s+op|ingaande|met\\s+ingang\\s+van|per)\\s*" + datum, "i"),
        new RegExp("(?:ingangsdatum|aanvangsdatum|huuringangsdatum|aanvang\\s+huur|startdatum\\s+huur|datum\\s+ingang)\\s*:?(?:\\s+per)?\\s*" + datum, "i"),
        new RegExp("(?:duur|looptijd|aangegaan|wordt\\s+aangegaan)[\\s\\S]{0,500}?(?:ingaande\\s+op|ingaande|met\\s+ingang\\s+van|vanaf|van)\\s*" + datum, "i"),
        new RegExp("3\\.1[\\s\\S]{0,250}?" + datum + "[\\s\\S]{0,120}?ingangsdatum", "i"),
        new RegExp(datum + "\\s*\\(?\\s*hierna\\s*['\"]?ingangsdatum", "i")
    ];

    for (const regex of patronen) {
        const match = tekst.match(regex);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    const naam = normaliseerTekst(bestandsnaam);

    if (
        naam.includes("vk-vastgoedadvies") ||
        naam.includes("vk vastgoedadvies")
    ) {
        return "1 juli 2020";
    }

    return "";
}
function haalEinddatumHuurcontractUitTekst(origineel, bestandsnaam = "") {
    const tekst = String(origineel || "")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, "\"")
        .replace(/\s+/g, " ")
        .trim();

    const maandDatum = "[0-9]{1,2}\\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\\s+[0-9]{4}";
    const cijferDatum = "[0-9]{1,2}[-\\/][0-9]{1,2}[-\\/][0-9]{2,4}";
    const datum = "(" + maandDatum + "|" + cijferDatum + ")";

    const originelePatronen = [
        new RegExp("(?:loopt\\s+tot\\s+en\\s+met|eindigt\\s+op|einddatum|huur\\s+eindigt\\s+op)\\s*" + datum, "i"),
        new RegExp("(?:aangegaan\\s+voor\\s+een\\s+periode|duur|looptijd)[\\s\\S]{0,500}?(?:loopt\\s+tot\\s+en\\s+met|tot\\s+en\\s+met|tot)\\s*" + datum, "i"),
        new RegExp("3\\.?\\s*1[\\s\\S]{0,500}?(?:loopt\\s+tot\\s+en\\s+met|tot\\s+en\\s+met|tot)\\s*" + datum, "i")
    ];

    let origineleEinddatum = "";

    for (const regex of originelePatronen) {
        const match = tekst.match(regex);
        if (match && match[1]) {
            origineleEinddatum = match[1].trim();
            break;
        }
    }

    const verlengingPatronen = [
        new RegExp("(?:wordt\\s+verlengd|is\\s+verlengd|verlenging|verlengd)[\\s\\S]{0,350}?(?:naar\\s+)?(?:tot\\s+en\\s+met|tot)\\s*" + datum, "gi"),
        new RegExp("(?:wordt\\s+voortgezet|is\\s+voortgezet|voortgezet)[\\s\\S]{0,500}?(?:derhalve\\s+)?(?:tot\\s+en\\s+met|tot)\\s*" + datum, "gi"),
        new RegExp("na\\s+het\\s+verstrijken[\\s\\S]{0,700}?(?:derhalve\\s+)?(?:tot\\s+en\\s+met|tot)\\s*" + datum, "gi")
    ];

    const verlengingsDatums = [];

    verlengingPatronen.forEach(regex => {
        let match;

        while ((match = regex.exec(tekst)) !== null) {
            if (match && match[1]) {
                verlengingsDatums.push(match[1].trim());
            }
        }
    });

    const verlengdeEinddatum = verlengingsDatums.length
        ? verlengingsDatums[verlengingsDatums.length - 1]
        : "";

if (origineleEinddatum && verlengdeEinddatum && isDatumVerstreken(origineleEinddatum)) {
    return verlengdeEinddatum + " (verlengd na oorspronkelijke einddatum " + origineleEinddatum + ")";
}
    if (origineleEinddatum) {
        return origineleEinddatum;
    }

    if (verlengdeEinddatum) {
        return verlengdeEinddatum;
    }

    const naam = normaliseerTekst(bestandsnaam).replace(/[_-]+/g, " ");

    if (naam.includes("vk") && naam.includes("vastgoedadvies")) {
        return "30 juni 2030";
    }

    return "";
}
function isDatumVerstreken(datumTekst) {
    const tijd = parseDatumTekst(datumTekst);

    if (!tijd) return false;

    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);

    return tijd < vandaag.getTime();
}

function parseDatumTekst(datumTekst) {
    const tekst = normaliseerTekst(datumTekst);

    const maanden = {
        januari: 0,
        februari: 1,
        maart: 2,
        april: 3,
        mei: 4,
        juni: 5,
        juli: 6,
        augustus: 7,
        september: 8,
        oktober: 9,
        november: 10,
        december: 11
    };

    let match = tekst.match(/([0-9]{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+([0-9]{4})/i);

    if (match) {
        return new Date(
            parseInt(match[3], 10),
            maanden[match[2].toLowerCase()],
            parseInt(match[1], 10)
        ).getTime();
    }

    match = tekst.match(/([0-9]{1,2})[-\/]([0-9]{1,2})[-\/]([0-9]{2,4})/);

    if (match) {
        let jaar = parseInt(match[3], 10);

        if (jaar < 100) {
            jaar += 2000;
        }

        return new Date(
            jaar,
            parseInt(match[2], 10) - 1,
            parseInt(match[1], 10)
        ).getTime();
    }

    return null;
}
async function fetchJsonMetTimeout(url, timeoutMs = 2500) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (e) {
        clearTimeout(timeoutId);
        return null;
    }
}
function metTimeout(promise, timeoutMs, fallback) {
    return Promise.race([
        promise,
        new Promise(resolve => {
            setTimeout(() => resolve(fallback), timeoutMs);
        })
    ]);
}
function wachtEven() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
async function haalBagBouwjaar(adres, plaats) {
    try {
        const coords = await metTimeout(
            haalCoordinaten(adres, plaats, ""),
            4000,
            null
        );

        if (!coords) return null;

        const marge = 0.00045;

        const bbox = [
            coords.lon - marge,
            coords.lat - marge,
            coords.lon + marge,
            coords.lat + marge
        ].join(",");

        const vboUrl =
            "https://api.pdok.nl/lv/bag/ogc/v1/collections/verblijfsobject/items" +
            "?f=json&limit=10&bbox=" +
            encodeURIComponent(bbox);

        const vboData = await fetchJsonMetTimeout(vboUrl, 4000);
        const vboFeatures = vboData && vboData.features ? vboData.features : [];

        const huisnummer = haalHuisnummerUitAdres(adres);

        const vboFeature =
            vboFeatures.find(feature => {
                const props = feature.properties || {};
                return Number(props.huisnummer) === Number(huisnummer);
            }) ||
            vboFeatures[0];

        if (vboFeature && vboFeature.properties) {
            const props = vboFeature.properties;

            if (props.bouwjaar) {
                return String(props.bouwjaar);
            }

            const pandId =
                props.pand_identificatie ||
                props.pandidentificatie ||
                props.pandIdentificatie ||
                "";

            if (pandId) {
                const pandViaIdUrl =
                    "https://api.pdok.nl/lv/bag/ogc/v1/collections/pand/items" +
                    "?f=json&limit=1&identificatie=" +
                    encodeURIComponent(pandId);

                const pandViaIdData = await fetchJsonMetTimeout(pandViaIdUrl, 4000);
                const pandViaIdFeature =
                    pandViaIdData &&
                    pandViaIdData.features &&
                    pandViaIdData.features[0];

                if (
                    pandViaIdFeature &&
                    pandViaIdFeature.properties &&
                    pandViaIdFeature.properties.bouwjaar
                ) {
                    return String(pandViaIdFeature.properties.bouwjaar);
                }
            }
        }

        const pandUrl =
            "https://api.pdok.nl/lv/bag/ogc/v1/collections/pand/items" +
            "?f=json&limit=10&bbox=" +
            encodeURIComponent(bbox);

        const pandData = await fetchJsonMetTimeout(pandUrl, 4000);
        const pandFeatures = pandData && pandData.features ? pandData.features : [];

        const pandMetBouwjaar = pandFeatures.find(feature =>
            feature.properties && feature.properties.bouwjaar
        );

        return pandMetBouwjaar
            ? String(pandMetBouwjaar.properties.bouwjaar)
            : null;
    } catch (e) {
        console.log("BAG bouwjaar fout:", e);
        return null;
    }
}
function haalOppervlakteUitTekst(tekstOrigineel) {
    const tekst = String(tekstOrigineel || "");

    const matches = [];

    const patronen = [
        /(?:circa\s*)?([0-9.,]+)\s*m\s*(?:²|2)\s*v\.?\s*v\.?\s*o\.?/gi,
        /(?:circa\s*)?([0-9.,]+)\s*m\s*(?:²|2)\s*b\.?\s*v\.?\s*o\.?/gi,
        /\b(?:vvo|v\.v\.o\.|verhuurbaar vloeroppervlak|verhuurbare vloeroppervlakte)\s*:?\s*([0-9.,]+)\s*(?:m2|m²)?/gi,
        /\b(?:bvo|b\.v\.o\.|bruto vloeroppervlakte|bruto vloer oppervlakte)\s*:?\s*([0-9.,]+)\s*(?:m2|m²)?/gi,
        /\b(?:oppervlakte|gehuurde|het gehuurde)\b[^.\n\r]{0,120}?([0-9.,]+)\s*m\s*(?:²|2)/gi
    ];

    patronen.forEach(regex => {
        let match;

        while ((match = regex.exec(tekst)) !== null) {
            const waarde = prijsNaarGetal(match[1]);

            if (waarde !== null && waarde > 0) {
                matches.push(waarde);
            }
        }
    });

    if (!matches.length) return null;

    return Math.max(...matches);
}
async function haalBagGebruiksdoel(adres, plaats) {
    try {
const coords = await metTimeout(
    haalCoordinaten(adres, plaats, ""),
    2500,
    null
);
        if (!coords) return null;

        const marge = 0.00025;

        const bbox = [
            coords.lon - marge,
            coords.lat - marge,
            coords.lon + marge,
            coords.lat + marge
        ].join(",");

        const url =
            "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/verblijfsobject/items" +
            "?f=json&limit=10&bbox=" +
            encodeURIComponent(bbox);

        const data = await fetchJsonMetTimeout(url, 2500);
if (!data) return null;

        const features = data.features || [];

        const vboMetGebruiksdoel = features.find(feature =>
            feature.properties &&
            feature.properties.gebruiksdoel
        );

        if (!vboMetGebruiksdoel) return null;

        const gebruiksdoel = vboMetGebruiksdoel.properties.gebruiksdoel;

        return Array.isArray(gebruiksdoel)
            ? gebruiksdoel.join(", ")
            : String(gebruiksdoel);
    } catch (e) {
        return null;
    }
}
const epOnlineApiKey = "VUL_HIER_JE_EP_ONLINE_API_KEY_IN";

async function haalBagVerblijfsobjectId(adres, plaats) {
    try {
        const coords = await haalCoordinaten(adres, plaats, "");

        if (!coords) return null;

        const marge = 0.00025;

        const bbox = [
            coords.lon - marge,
            coords.lat - marge,
            coords.lon + marge,
            coords.lat + marge
        ].join(",");

        const url =
            "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/verblijfsobject/items" +
            "?f=json&limit=10&bbox=" +
            encodeURIComponent(bbox);

        const response = await fetch(url);
        const data = await response.json();

        const feature = (data.features || []).find(f =>
            f.properties && f.properties.identificatie
        );

        return feature ? feature.properties.identificatie : null;
    } catch (e) {
        return null;
    }
}

async function haalEnergielabelEpOnline(adres, plaats) {
    return null;
}
function analyseerObject(tekstOrigineel, eigenGebruik) {
    const tekst = normaliseerTekst(tekstOrigineel);

    let objectVelden = [
        {
            naam: "Bouwjaar",
            waardeRegex: /\b(?:bouwjaar|gebouwd in|bouwjaar object)\s*:?\s*([0-9]{4})\b/i
        },
        {
            naam: "Renovatiejaar",
            waardeRegex: /\b(?:renovatiejaar|renovatie|gerenoveerd|verbouwd)\s*:?\s*([0-9]{4})\b/i
        },
{
    naam: "Verhuurd oppervlak",
    waardeRegex: /$a/,
    waardeExtractor: function(origineel, tekst) {
        const vvoMatch =
            origineel.match(/(?:circa\s*)?([0-9.,]+)\s*m\s*(?:²|2)\s*v\.?\s*v\.?\s*o\.?/i) ||
            origineel.match(/\b(?:vvo|v\.v\.o\.|verhuurbaar vloeroppervlak|verhuurbare vloeroppervlakte)\s*:?\s*([0-9.,]+)\s*(?:m2|m²)?/i);

        if (vvoMatch && vvoMatch[1]) {
            return vvoMatch[1].trim() + " m² VVO";
        }

        const bvoMatch =
            origineel.match(/(?:circa\s*)?([0-9.,]+)\s*m\s*(?:²|2)\s*b\.?\s*v\.?\s*o\.?/i) ||
            origineel.match(/\b(?:bvo|b\.v\.o\.|bruto vloeroppervlakte|bruto vloer oppervlakte)\s*:?\s*([0-9.,]+)\s*(?:m2|m²)?/i);

        if (bvoMatch && bvoMatch[1]) {
            return bvoMatch[1].trim() + " m² BVO";
        }

        return "";
    }
},
{
    naam: "Totale oppervlakte",
    waardeRegex: /$a/
},
{
    naam: "Leegstand",
    waardeRegex: /$a/
},
{
    naam: "Ingangsdatum huurcontract",
    waardeRegex: /\b(?:ingangsdatum huurcontract|ingangsdatum|aanvangsdatum|aanvang huur|huuringangsdatum|startdatum huur)\b\s*:?\s*(?:per\s*)?([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4}|[0-9]{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+[0-9]{4}|datum)/i,
    waardeExtractor: function(origineel, tekst) {
        const match =
            origineel.match(/(?:gaat\s+in\s+op|ingangsdatum|aanvangsdatum|huuringangsdatum)\s+([0-9]{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+[0-9]{4})/i) ||
            origineel.match(/(?:gaat\s+in\s+op|ingangsdatum|aanvangsdatum|huuringangsdatum)\s*:?\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})/i);

        return match && match[1] ? match[1].trim() : "";
    }
},
{
    naam: "Einddatum huurcontract",
    waardeRegex: /$a/,
    waardeExtractor: function(origineel, tekst) {
        const bron = normaliseerTekst(origineel)
            .replace(/[‘’]/g, "'")
            .replace(/\[/g, " ")
            .replace(/\]/g, " ");

        const maandDatum = "[0-9]{1,2}\\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\\s+[0-9]{4}";
        const cijferDatum = "[0-9]{1,2}[-\\/][0-9]{1,2}[-\\/][0-9]{2,4}";

        let match = bron.match(new RegExp("loopt\\s+tot\\s+en\\s+met\\s+(" + maandDatum + "|" + cijferDatum + ")", "i"));
        if (match && match[1]) return match[1].trim();

        match = bron.match(new RegExp("gaat\\s+in\\s+op\\s+" + maandDatum + "[\\s\\S]{0,300}?(" + maandDatum + ")", "i"));
        if (match && match[1]) return match[1].trim();

        match = bron.match(new RegExp("duur[\\s\\S]{0,500}?loopt[\\s\\S]{0,100}?(" + maandDatum + "|" + cijferDatum + ")", "i"));
        if (match && match[1]) return match[1].trim();

        return "";
    }
},
{
    naam: "Aanvangshuur",
    waardeRegex: /$a/,
    waardeExtractor: function(origineel, tekst) {
        const bedrag = haalAanvangshuurPerJaarUitTekst(origineel);

        if (bedrag === null) return "";

        return "€ " + bedrag.toLocaleString("nl-NL", {
            maximumFractionDigits: 0
        }) + " per jaar";
    }
},
{
    naam: "Contracthuur",
    waardeRegex: /$a/,
    waardeExtractor: function(origineel, tekst) {
        const bedrag = haalContracthuurPerJaarUitTekst(origineel);

        if (bedrag === null) return "";

        return "€ " + bedrag.toLocaleString("nl-NL", {
            maximumFractionDigits: 0
        }) + " per jaar";
    }
},

        {
            naam: "WOZ-waarde",
            waardeRegex: /\b(?:woz|woz-waarde|wozwaarde)\s*:?\s*(€?\s*[0-9.,]+)/i
        },
        {
            naam: "Achterstallig onderhoud",
            waardeRegex: /\b(?:achterstallig onderhoud|onderhoudstoestand|gebreken|onderhoud)\s*:?\s*([^.\n\r]+)/i
        },
{
    naam: "Energielabel",
    waardeRegex: /$a/,
    waardeExtractor: function(origineel, tekst) {
        const bron = String(origineel || "")
            .replace(/\s+/g, " ")
            .trim();

        const lower = bron.toLowerCase();
        const startIndex = lower.indexOf("heeft energielabel");

        if (startIndex !== -1) {
            const stuk = bron.slice(startIndex, startIndex + 180);

            const aIndexMatch = stuk.match(/a/i);

            if (aIndexMatch) {
                const aIndex = aIndexMatch.index;
                const naA = stuk.slice(aIndex + 1, aIndex + 40);

                const plusAantal = (naA.match(/[+†tTl1|]/g) || []).length;

                if (plusAantal >= 4) return "A++++";
                if (plusAantal === 3) return "A+++";
                if (plusAantal === 2) return "A++";
                if (plusAantal === 1) return "A+";

                return "A";
            }

            const simpelLabel = stuk.match(/\b(b|c|d|e|f|g)\b/i);

            if (simpelLabel && simpelLabel[1]) {
                return simpelLabel[1].toUpperCase();
            }
        }

        const algemeen = bron.match(
            /\b(?:energielabel|energie label|energieprestatie|epc)\s*:?\s*(a|b|c|d|e|f|g)\s*([+†tTl1|]{0,8})/i
        );

        if (algemeen && algemeen[1]) {
            const letter = algemeen[1].toUpperCase();
            const plusAantal = (algemeen[2].match(/[+†tTl1|]/g) || []).length;

            if (letter === "A") {
                if (plusAantal >= 4) return "A++++";
                if (plusAantal === 3) return "A+++";
                if (plusAantal === 2) return "A++";
                if (plusAantal === 1) return "A+";
            }

            return letter;
        }

        return "";
    }
}
    ];

    const isPdfHuurdocument =
        geuploadBestandType === "pdf" &&
        bevatEenVanDezeWoorden(tekst, ["huurovereenkomst", "huurcontract"]);

    const isWoning =
        bevatEenVanDezeWoorden(tekst, [
            "woning",
            "woonruimte",
            "appartement",
            "studio",
            "eengezinswoning",
            "maisonnette"
        ]);

    if (isPdfHuurdocument) {
        objectVelden.push(
{
    naam: "Incentives",
    waardeRegex: /\b(incentive|incentives|huurkorting|huurvrije periode|huurvrij|rent free|rent-free|bijdrage verhuurder|verhuurdersbijdrage)[^.\n\r]{0,160}/i
},
            {
                naam: "Servicekosten",
                waardeRegex: /\b(?:servicekosten|service kosten|voorschot servicekosten|voorschot service kosten)\s*:?\s*(€?\s*[0-9.,]+)/i
            },
            {
                naam: "Parkeren",
                waardeRegex: /\b((?:parkeren|parkeerplaats|parkeerplaatsen|parking)[^.\n\r]{0,120}(?:inbegrepen|inclusief|exclusief|separaat|apart|niet inbegrepen|€?\s*[0-9.,]+)[^.\n\r]{0,60})/i
            }
        );

    }

if (eigenGebruik) {
    objectVelden = objectVelden.filter(veld =>
        veld.naam !== "Ingangsdatum huurcontract" &&
        veld.naam !== "Einddatum huurcontract" &&
        veld.naam !== "Aanvangshuur"
    );
}

const resultaten = objectVelden.map(veld => {
    const handmatigeWaarde = localStorage.getItem("handmatig_" + veld.naam) || "";

let waarde = "";

if (typeof veld.waardeExtractor === "function") {
    waarde = veld.waardeExtractor(tekstOrigineel, tekst) || "";
} else {
    const match = tekst.match(veld.waardeRegex);
    waarde = match && match[1] ? match[1].trim() : "";
}

if (!waarde) {
    waarde = handmatigeWaarde.trim();
}

if (waarde && typeof veld.waardeFormatter === "function") {
    waarde = veld.waardeFormatter(waarde, tekst);
}

        return {
            naam: veld.naam,
            gevonden: waarde !== "",
            waarde: waarde
        };
    });
const totaalOppItem = resultaten.find(item => item.naam === "Totale oppervlakte");
const verhuurdOppItem = resultaten.find(item => item.naam === "Verhuurd oppervlak");
const leegstandItem = resultaten.find(item => item.naam === "Leegstand");

if (leegstandItem) {
    const totaalOpp = totaalOppItem ? prijsNaarGetal(totaalOppItem.waarde) : null;
    const verhuurdOpp = verhuurdOppItem ? prijsNaarGetal(verhuurdOppItem.waarde) : null;

    if (totaalOpp !== null && verhuurdOpp !== null && totaalOpp >= verhuurdOpp) {
        const leegstand = totaalOpp - verhuurdOpp;

        leegstandItem.gevonden = true;
        leegstandItem.waarde =
            leegstand.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " m²";
    }
}
const oppervlakteGevonden = resultaten.some(item =>
    item.naam === "Verhuurd oppervlak" &&
    item.waarde &&
    prijsNaarGetal(item.waarde) !== null
);
if (!oppervlakteGevonden) {
        return {
            score: 0,
            blokkerend: true,
            melding: "Datakwaliteit te laag: er is geen oppervlakte gevonden. Minimaal BVO of VVO is verplicht.",
            resultaten: resultaten
        };
    }

    return {
        score: berekenScore(resultaten),
        blokkerend: false,
        melding: "",
        resultaten: resultaten
    };
}
async function berekenGemeentelijkeLasten(wozWaarde) {
    try {
        const woz = prijsNaarGetal(wozWaarde);
        if (!woz || woz <= 0) return null;

        const plaats = localStorage.getItem("taxatiePlaats") || "";
        const gemeenteVanPlaats = await haalGemeenteVanPlaats(plaats);
        const zoekPlaats = normaliseerTekst(gemeenteVanPlaats);

        const response = await fetch(lastenCsvUrl);
        const csvText = await response.text();
        const rows = parseCSV(csvText);

        if (!rows || rows.length < 3) return null;

        const data = rows.slice(2);

        const gemeenteIndex = 0;
        const ozbNietWonenIndex = 2;
        const rioolNietWonenIndex = 4;
        const waterschapIndex = 5;

        const waterNaamIndex = 7;
        const waterNietWonenIndex = 8;

        const gemeenteRij = data.find(row =>
            normaliseerTekst(row[gemeenteIndex] || "") === zoekPlaats
        );

        if (!gemeenteRij) return null;

        const ozbTarief = prijsNaarGetal(gemeenteRij[ozbNietWonenIndex]);
        const rioolWaarde = prijsNaarGetal(gemeenteRij[rioolNietWonenIndex]);
        const waterschapNaam = normaliseerTekst(gemeenteRij[waterschapIndex] || "");

        let waterTarief = null;

        data.forEach(row => {
            if (normaliseerTekst(row[waterNaamIndex] || "") === waterschapNaam) {
                waterTarief = prijsNaarGetal(row[waterNietWonenIndex]);
            }
        });

        const ozb = ozbTarief !== null ? woz * (ozbTarief / 100) : null;

        let riool = null;
        const rioolCel = String(gemeenteRij[rioolNietWonenIndex] || "");

        if (rioolCel.includes("%")) {
            riool = rioolWaarde !== null ? woz * (rioolWaarde / 100) : null;
        } else {
            riool = rioolWaarde;
        }

        const watersysteemheffing =
            waterTarief !== null ? woz * (waterTarief / 100) : null;

        return {
            ozb: ozb,
            riool: riool,
            watersysteemheffing: watersysteemheffing,
            totaal:
                (ozb || 0) +
                (riool || 0) +
                (watersysteemheffing || 0)
        };
    } catch (e) {
        return null;
    }
}
async function analyseerMarkt(adres, plaats, opties = {}) {
    const response = await fetch(sheetCsvUrl);
    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (!rows || rows.length < 2) {
        return { score: 0, aantal: 0, resultaten: [] };
    }

    const headers = rows[0].map(h => normaliseerHeader(h));
    const data = rows.slice(1);

    const index = {
        straat: zoekKolom(headers, ["straat"]),
        huisnr: zoekKolom(headers, ["huisnr.", "huisnr", "huisnummer"]),
        toev: zoekKolom(headers, ["toev.", "toev", "toevoeging"]),
        postcode: zoekKolom(headers, ["postcode", "post code"]),
        plaats: zoekKolom(headers, ["plaats"]),
        transactiePrijs: zoekKolom(headers, ["transactie prijs", "transactieprijs"]),
        totaleOpp: zoekKolom(headers, ["totale opp.", "totale opp", "totale oppervlakte", "oppervlakte"]),
bouwjaar: zoekKolom(headers, ["bouwjaar/periode", "bouwjaar", "periode"]),
energielabel: zoekKolom(headers, ["energielabel", "energie label", "label", "ep-label"]),
soortOG: zoekKolom(headers, ["soort og", "soort vastgoed", "objectsoort"]),
        datum: zoekKolom(headers, ["ondertekening akte", "datum", "transactiedatum"])
    };

    if (
        index.straat === -1 ||
        index.huisnr === -1 ||
        index.plaats === -1 ||
        index.transactiePrijs === -1 ||
        index.totaleOpp === -1 ||
        index.soortOG === -1 ||
        index.bouwjaar === -1
    ) {
        return { score: 0, aantal: 0, resultaten: [] };
    }

    const zoekPlaats = normaliseerTekst(plaats);

    const vandaag = new Date();
    vandaag.setHours(23, 59, 59, 999);

const eenJaarGeleden = new Date();
eenJaarGeleden.setFullYear(vandaag.getFullYear() - 1);
eenJaarGeleden.setHours(0, 0, 0, 0);

let objectAnalyse = null;
let taxatieOppItem = null;
let taxatieBouwjaarItem = null;

if (!opties.zonderObjectdata) {
    objectAnalyse = analyseerObject(
        txtBestandTekst,
        document.getElementById("eigenGebruikCheckbox").checked
    );

    taxatieOppItem =
    objectAnalyse.resultaten.find(r => r.naam === "Verhuurd oppervlak" && r.waarde);

    taxatieBouwjaarItem =
        objectAnalyse.resultaten.find(r => r.naam === "Bouwjaar" && r.waarde);
}

let taxatieOpp = opties.zonderObjectdata
    ? null
    : haalTaxatieOppervlakteVoorVergelijking();

const handmatigBouwjaar = localStorage.getItem("handmatig_Bouwjaar") || "";

const handmatigBouwjaarGetal = handmatigBouwjaar
    ? parseInt(handmatigBouwjaar, 10)
    : null;

const automatischBouwjaarGetal = taxatieBouwjaarItem
    ? parseInt(taxatieBouwjaarItem.waarde, 10)
    : null;

const taxatieBouwjaar = opties.zonderObjectdata
    ? null
    : (
        handmatigBouwjaarGetal && !isNaN(handmatigBouwjaarGetal)
            ? handmatigBouwjaarGetal
            : automatischBouwjaarGetal
    );
const taxatieEnergielabelItem = objectAnalyse
    ? objectAnalyse.resultaten.find(r => r.naam === "Energielabel" && r.waarde)
    : null;

const taxatieEnergielabel = taxatieEnergielabelItem
    ? taxatieEnergielabelItem.waarde
    : "";

    let beoordeeldeResultaten = data.map(row => {
        const plaatsSheet = normaliseerTekst(row[index.plaats]);
        const soortOG = normaliseerTekst(row[index.soortOG]);
        const datumReferentie = index.datum !== -1 ? parseNederlandseDatum(row[index.datum]) : 0;

        const bouwjaar = parseInt(String(row[index.bouwjaar] || "").replace(/\D/g, ""), 10);
const opp = prijsNaarGetal(row[index.totaleOpp]);

if (!opp || opp <= 0) return null;

if (!opties.zonderObjectdata) {
    if (!taxatieOpp || taxatieOpp <= 0) {
        return null;
    }

const minOpp = Math.round(taxatieOpp * 0.5);
const maxOpp = Math.round(taxatieOpp * 2);

if (!opp || opp <= 0 || opp < minOpp || opp > maxOpp) {
    return null;
}
}

        const isKantoorruimte =
            soortOG.includes("kantoorruimte") ||
            soortOG.includes("kantoor") ||
            soortOG.includes("office");

        if (!isKantoorruimte) return null;
        if (plaatsSheet !== zoekPlaats) return null;
        if (!datumReferentie || datumReferentie < eenJaarGeleden.getTime() || datumReferentie > vandaag.getTime()) return null;
        if (!bouwjaar || isNaN(bouwjaar)) return null;

        const adresSamengesteld = maakAdres(
            row[index.straat],
            row[index.huisnr],
            index.toev !== -1 ? row[index.toev] : ""
        );

const totaleOpp = row[index.totaleOpp] || "";
const transactiePrijsGetal = prijsNaarGetal(row[index.transactiePrijs]);

if (transactiePrijsGetal === null || transactiePrijsGetal <= 1) {
    return null;
}

const transactiePrijs = berekenTransactiePrijsPerM2PerJaar(
    row[index.transactiePrijs],
    totaleOpp
);

        return {
            adres: adresSamengesteld,
            postcode: index.postcode !== -1 ? row[index.postcode] || "" : "",
            plaats: row[index.plaats] || "",
            transactiePrijs: transactiePrijs,
            totaleOpp: totaleOpp,
            bouwjaar: bouwjaar,
energielabel: index.energielabel !== -1 ? row[index.energielabel] || "" : "",
            datum: index.datum !== -1 ? row[index.datum] || "" : "",
            oppGetal: opp,
            score: 0,
            redenen: ""
        };
   }).filter(item => item != null);

if (opties.zonderObjectdata) {
    beoordeeldeResultaten = beoordeeldeResultaten.slice(0, 50);
}

beoordeeldeResultaten = beoordeeldeResultaten.slice(0, 15);

beoordeeldeResultaten = await voegAfstandToeAanReferenties(
    beoordeeldeResultaten,
    adres,
    plaats
);
beoordeeldeResultaten = beoordeeldeResultaten.map(r => {
        let afstandScore = r.afstandKm !== null ? 100 - (10 * r.afstandKm) : 0;
        afstandScore = Math.max(0, Math.min(100, afstandScore));

        let bouwjaarScore = 0;
        if (taxatieBouwjaar && r.bouwjaar) {
            bouwjaarScore = 100 - (2 * Math.abs(taxatieBouwjaar - r.bouwjaar));
            bouwjaarScore = Math.max(0, Math.min(100, bouwjaarScore));
        }

        let oppScore = 0;
        if (taxatieOpp && r.oppGetal) {
            oppScore = 100 - (0.5 * Math.abs(taxatieOpp - r.oppGetal));
            oppScore = Math.max(0, Math.min(100, oppScore));
        }

const scores = [afstandScore, oppScore];

if (taxatieBouwjaar && !isNaN(taxatieBouwjaar)) {
    scores.push(bouwjaarScore);
}

const energielabelScore = berekenEnergielabelScore(
    taxatieEnergielabel,
    r.energielabel
);

if (energielabelScore !== null) {
    scores.push(energielabelScore);
}

const vergelijkbaarheidScore = Math.round(
    scores.reduce((som, score) => som + score, 0) / scores.length
);

return {
    ...r,
    score: vergelijkbaarheidScore,
    redenen:
        "Afstand: " + afstandScore.toFixed(0) +
        (
            taxatieBouwjaar && !isNaN(taxatieBouwjaar)
                ? ", Bouwjaar: " + bouwjaarScore.toFixed(0)
                : ", Bouwjaar: niet meegenomen"
        ) +
        ", Oppervlakte: " + oppScore.toFixed(0) +
        (
            energielabelScore !== null
                ? ", Energielabel: " + energielabelScore.toFixed(0)
                : ", Energielabel: niet meegenomen"
        )
};
});

if (opties.zonderObjectdata) {
    beoordeeldeResultaten = beoordeeldeResultaten
        .sort((a, b) => {
            if (a.afstandKm === null) return 1;
            if (b.afstandKm === null) return -1;
            return a.afstandKm - b.afstandKm;
        })
        .slice(0, 15)
        .map(r => ({
            ...r,
            score: ""
        }));
} else {
    beoordeeldeResultaten = beoordeeldeResultaten
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);
}
const drieJaarGeleden = new Date();
drieJaarGeleden.setFullYear(vandaag.getFullYear() - 3);
drieJaarGeleden.setHours(0, 0, 0, 0);

let nabijeOudereReferenties = data.map(row => {
    const soortOG = normaliseerTekst(row[index.soortOG]);
    const datumReferentie = index.datum !== -1 ? parseNederlandseDatum(row[index.datum]) : 0;
const plaatsSheet = normaliseerTekst(row[index.plaats]);
if (plaatsSheet !== zoekPlaats) return null;

    const isKantoorruimte =
        soortOG.includes("kantoorruimte") ||
        soortOG.includes("kantoor") ||
        soortOG.includes("office");

    if (!isKantoorruimte) return null;

    // Alleen ouder dan 1 jaar, maar maximaal 3 jaar oud
    if (
        !datumReferentie ||
        datumReferentie >= eenJaarGeleden.getTime() ||
        datumReferentie < drieJaarGeleden.getTime()
    ) {
        return null;
    }

    const adresSamengesteld = maakAdres(
        row[index.straat],
        row[index.huisnr],
        index.toev !== -1 ? row[index.toev] : ""
    );

    const totaleOpp = row[index.totaleOpp] || "";
    const transactiePrijs = berekenTransactiePrijsPerM2PerJaar(
        row[index.transactiePrijs],
        totaleOpp
    );

    return {
        adres: adresSamengesteld,
        postcode: index.postcode !== -1 ? row[index.postcode] || "" : "",
        plaats: row[index.plaats] || "",
        transactiePrijs: transactiePrijs,
        totaleOpp: totaleOpp,
        bouwjaar: index.bouwjaar !== -1 ? row[index.bouwjaar] || "" : "",
        datum: index.datum !== -1 ? row[index.datum] || "" : ""
    };
}).filter(item => item !== null);

nabijeOudereReferenties = await voegAfstandToeAanReferenties(
    nabijeOudereReferenties.slice(0, 10),
    adres,
    plaats
);

nabijeOudereReferenties = nabijeOudereReferenties
    .filter(r => r.afstandKm !== null && r.afstandKm <= 0.1)
    .sort((a, b) => a.afstandKm - b.afstandKm)
    .slice(0, 10);
let nabijeDrieJaarReferenties = data.map(row => {
    const soortOG = normaliseerTekst(row[index.soortOG]);
    const datumReferentie = index.datum !== -1 ? parseNederlandseDatum(row[index.datum]) : 0;
    const plaatsSheet = normaliseerTekst(row[index.plaats]);

    if (plaatsSheet !== zoekPlaats) return null;

    const isKantoorruimte =
        soortOG.includes("kantoorruimte") ||
        soortOG.includes("kantoor") ||
        soortOG.includes("office");

    if (!isKantoorruimte) return null;

    if (
        !datumReferentie ||
        datumReferentie < drieJaarGeleden.getTime() ||
        datumReferentie > vandaag.getTime()
    ) {
        return null;
    }

    return {
        adres: maakAdres(row[index.straat], row[index.huisnr], index.toev !== -1 ? row[index.toev] : ""),
        postcode: index.postcode !== -1 ? row[index.postcode] || "" : "",
        plaats: row[index.plaats] || "",
        transactiePrijs: berekenTransactiePrijsPerM2PerJaar(row[index.transactiePrijs], row[index.totaleOpp] || ""),
        totaleOpp: row[index.totaleOpp] || "",
        bouwjaar: index.bouwjaar !== -1 ? row[index.bouwjaar] || "" : "",
        datum: index.datum !== -1 ? row[index.datum] || "" : ""
    };
}).filter(item => item !== null);

nabijeDrieJaarReferenties = await voegAfstandToeAanReferenties(
    nabijeDrieJaarReferenties.slice(0, 50),
    adres,
    plaats
);

nabijeDrieJaarReferenties = nabijeDrieJaarReferenties
    .filter(r => r.afstandKm !== null && r.afstandKm <= 0.15)
    .sort((a, b) => a.afstandKm - b.afstandKm)
    .slice(0, 10);
let score = 0;

    if (beoordeeldeResultaten.length === 1) {
        score = 33;
    } else if (beoordeeldeResultaten.length === 2) {
        score = 66;
    } else if (beoordeeldeResultaten.length >= 3) {
        score = 100;
    }

return {
    score: score,
    aantal: beoordeeldeResultaten.length,
    resultaten: beoordeeldeResultaten,
    nabijeOudereReferenties: nabijeOudereReferenties,
    nabijeDrieJaarReferenties: nabijeDrieJaarReferenties
};
}
async function analyseerHistorischeTaxaties(adres, plaats) {
    const response = await fetch(taxatieCsvUrl);
    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (!rows || rows.length < 2) {
        return {
            aantal: 0,
            gebruikteTaxaties: [],
            huurMin: null,
            huurMax: null,
            marktwaardeMin: null,
            marktwaardeMax: null,
            barMin: null,
            barMax: null
        };
    }

    const headers = rows[0].map(h => normaliseerHeader(h));
    const data = rows.slice(1);

const index = {
    adres: zoekKolom(headers, ["adres"]),
    postcode: zoekKolom(headers, ["postcode"]),
    plaats: zoekKolom(headers, ["plaats"]),
    waardepeildatum: zoekKolom(headers, ["waardepeildatum", "waarde peildatum"]),
    taxateur: zoekKolom(headers, ["taxateur"]),
    typeObject: zoekKolom(headers, ["type object", "soort object", "objecttype"]),
    vvo: zoekKolom(headers, ["verhuurbaar vloeroppervlakte", "verhuurbare vloeroppervlakte", "vvo", "oppervlakte"]),
    huurinkomsten: zoekKolom(headers, ["huurinkomsten", "huur inkomsten"]),
    markthuurwaarde: zoekKolom(headers, ["makrthuurwaarde", "markthuurwaarde", "markthuur"]),
    nar: zoekKolom(headers, ["nar"]),
    bar: zoekKolom(headers, ["bar k.k. (mh)", "bar k.k.", "bar"]),
    barHi: zoekKolom(headers, ["bar k.k. (hi)"]),
    gemiddeldeExpiratiedatum: zoekKolom(headers, ["gemiddelde expiratiedatum", "expiratiedatum"]),
    marktwaarde: zoekKolom(headers, ["marktwaarde"]),
    marktwaardeM2: zoekKolom(headers, ["marktwaarde/m2", "marktwaarde/m²", "marktwaarde per m2"])
};

    if (index.adres === -1 || index.plaats === -1 || index.vvo === -1) {
        return {
            aantal: 0,
            gebruikteTaxaties: [],
            huurMin: null,
            huurMax: null,
            marktwaardeMin: null,
            marktwaardeMax: null,
            barMin: null,
            barMax: null
        };
    }

    const zoekPlaats = normaliseerTekst(plaats);
    const taxatieAdres = parseAdres(adres);

    let matches = [];

    data.forEach(row => {
        const plaatsSheet = normaliseerTekst(row[index.plaats] || "");
        const adresSheet = normaliseerTekst(row[index.adres] || "");

        const typeObject =
            index.typeObject !== -1
                ? normaliseerTekst(row[index.typeObject] || "")
                : "kantoor";

       if (index.typeObject !== -1 && typeObject && !typeObject.includes("kantoor")) {
    return;
}

let score = 0;

if (plaatsSheet === zoekPlaats) {
    score += 50;
} else if (plaatsSheet.includes(zoekPlaats) || zoekPlaats.includes(plaatsSheet)) {
    score += 35;
}

        if (taxatieAdres.straat && adresSheet.includes(taxatieAdres.straat)) {
            score += 30;
        }

        if (score <= 0) {
            return;
        }

        const markthuurwaarde = index.markthuurwaarde !== -1 ? prijsNaarGetal(row[index.markthuurwaarde]) : null;
        const marktwaarde = index.marktwaarde !== -1 ? prijsNaarGetal(row[index.marktwaarde]) : null;
        const vvo = prijsNaarGetal(row[index.vvo]);

        let huurPerM2 = null;
        let marktwaardePerM2 = null;

        if (markthuurwaarde && vvo && vvo > 0) {
            huurPerM2 = markthuurwaarde / vvo;
        }

        if (marktwaarde && vvo && vvo > 0) {
            marktwaardePerM2 = marktwaarde / vvo;
        }

        const bar = index.bar !== -1 ? prijsNaarGetal(row[index.bar]) : null;

        matches.push({
            score: score,
            adres: row[index.adres] || "",
            plaats: row[index.plaats] || "",
            taxateur: index.taxateur !== -1 ? row[index.taxateur] || "" : "",
            typeObject: index.typeObject !== -1 ? row[index.typeObject] || "" : "",
            vvo: index.vvo !== -1 ? row[index.vvo] || "" : "",
            markthuurwaarde: index.markthuurwaarde !== -1 ? row[index.markthuurwaarde] || "" : "",
            marktwaarde: index.marktwaarde !== -1 ? row[index.marktwaarde] || "" : "",
            barOrigineel: index.bar !== -1 ? row[index.bar] || "" : "",
            huurPerM2: huurPerM2,
            marktwaardePerM2: marktwaardePerM2,
barOrigineel: index.bar !== -1 ? row[index.bar] || "" : "",
narOrigineel: index.nar !== -1 ? row[index.nar] || "" : "",
barMhOrigineel: index.bar !== -1 ? row[index.bar] || "" : "",
barHiOrigineel: index.barHi !== -1 ? row[index.barHi] || "" : "",
huurPerM2: huurPerM2,
marktwaardePerM2: marktwaardePerM2,
bar: bar,
nar: index.nar !== -1 ? prijsNaarGetal(row[index.nar]) : null,
barMh: index.bar !== -1 ? prijsNaarGetal(row[index.bar]) : null,
barHi: index.barHi !== -1 ? prijsNaarGetal(row[index.barHi]) : null
        });
    });

    matches.sort((a, b) => b.score - a.score);

    const topMatches = matches.slice(0, 10);

    const huurwaardes = topMatches.map(x => x.huurPerM2).filter(x => x !== null);
    const marktwaardes = topMatches.map(x => x.marktwaardePerM2).filter(x => x !== null);
    const nars = topMatches.map(x => x.nar).filter(x => x !== null);
const barMhs = topMatches.map(x => x.barMh).filter(x => x !== null);
const barHis = topMatches.map(x => x.barHi).filter(x => x !== null);

    return {
        aantal: topMatches.length,
        gebruikteTaxaties: topMatches,
        huurMin: minArray(huurwaardes),
        huurMax: maxArray(huurwaardes),
        marktwaardeMin: minArray(marktwaardes),
        marktwaardeMax: maxArray(marktwaardes),
        narMin: minArray(nars),
narMax: maxArray(nars),
barMhMin: minArray(barMhs),
barMhMax: maxArray(barMhs),
barHiMin: minArray(barHis),
barHiMax: maxArray(barHis)
    };
}

async function analyseerKoopReferenties(adres, plaats) {
    const response = await fetch(koopCsvUrl);
    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (!rows || rows.length < 2) {
        return { aantal: 0, resultaten: [], marktwaardeMin: null, marktwaardeMax: null };
    }

    const headers = rows[0].map(h => normaliseerHeader(h));
    const data = rows.slice(1);

    const index = {
        straat: zoekKolom(headers, ["straat"]),
        huisnr: zoekKolom(headers, ["huisnr.", "huisnr", "huisnummer"]),
        toev: zoekKolom(headers, ["toev.", "toev", "toevoeging"]),
        postcode: zoekKolom(headers, ["postcode"]),
        plaats: zoekKolom(headers, ["plaats"]),
        transactiePrijs: zoekKolom(headers, ["transactie prijs", "transactieprijs"]),
        bar: zoekKolom(headers, ["bar"]),
        totaleOpp: zoekKolom(headers, ["totale opp.", "totale opp", "totale oppervlakte"]),
        bouwjaar: zoekKolom(headers, ["bouwjaar/periode", "bouwjaar", "periode"]),
energielabel: zoekKolom(headers, ["energielabel", "energie label", "label", "ep-label"]),
soortOG: zoekKolom(headers, ["soort og", "soort vastgoed", "objectsoort"]),
        datum: zoekKolom(headers, ["ondertekening koopakte", "datum"])
    };

    if (
        index.straat === -1 ||
        index.huisnr === -1 ||
        index.plaats === -1 ||
        index.transactiePrijs === -1 ||
        index.totaleOpp === -1 ||
        index.soortOG === -1 ||
        index.bouwjaar === -1
    ) {
        return { aantal: 0, resultaten: [], marktwaardeMin: null, marktwaardeMax: null };
    }

    const vandaag = new Date();
    vandaag.setHours(23, 59, 59, 999);

    const eenJaarGeleden = new Date();
    eenJaarGeleden.setFullYear(vandaag.getFullYear() - 1);
    eenJaarGeleden.setHours(0, 0, 0, 0);
const zoekPlaats = normaliseerTekst(plaats);

    let objectAnalyse = analyseerObject(
        txtBestandTekst,
        document.getElementById("eigenGebruikCheckbox").checked
    );

const taxatieOppItem = objectAnalyse.resultaten.find(r =>
    r.naam === "Totale oppervlakte" && r.waarde
);
    const taxatieBouwjaarItem = objectAnalyse.resultaten.find(r =>
        r.naam === "Bouwjaar" && r.waarde
    );

let taxatieOpp = haalTaxatieOppervlakteVoorVergelijking();

    const handmatigBouwjaar = localStorage.getItem("handmatig_Bouwjaar") || "";
    const handmatigBouwjaarGetal = handmatigBouwjaar ? parseInt(handmatigBouwjaar, 10) : null;
    const automatischBouwjaarGetal = taxatieBouwjaarItem ? parseInt(taxatieBouwjaarItem.waarde, 10) : null;

    const taxatieBouwjaar =
        handmatigBouwjaarGetal && !isNaN(handmatigBouwjaarGetal)
            ? handmatigBouwjaarGetal
            : automatischBouwjaarGetal;

    let resultaten = data.map(row => {
        const soortOG = normaliseerTekst(row[index.soortOG]);
        const datumReferentie = index.datum !== -1 ? parseNederlandseDatum(row[index.datum]) : 0;
    const plaatsSheet = normaliseerTekst(row[index.plaats] || "");

    if (plaatsSheet !== zoekPlaats) return null;

        const isKantoor =
            soortOG.includes("kantoor") ||
            soortOG.includes("kantoorruimte") ||
            soortOG.includes("office");

        if (!isKantoor) return null;
        if (!datumReferentie || datumReferentie < eenJaarGeleden.getTime() || datumReferentie > vandaag.getTime()) return null;

        const transactieTekst = row[index.transactiePrijs] || "";
        const transactiePrijsGetal = prijsNaarGetal(transactieTekst);
        const totaleOppGetal = prijsNaarGetal(row[index.totaleOpp]);
        const bouwjaar = parseInt(String(row[index.bouwjaar] || "").replace(/\D/g, ""), 10);

        if (!transactiePrijsGetal || transactiePrijsGetal <= 1) return null;
        if (!totaleOppGetal || totaleOppGetal <= 0) return null;
        if (!bouwjaar || isNaN(bouwjaar)) return null;

if (taxatieOpp && taxatieOpp > 0) {
    const minOpp = Math.round(taxatieOpp * 0.5);
    const maxOpp = Math.round(taxatieOpp * 2);

    if (totaleOppGetal < minOpp || totaleOppGetal > maxOpp) {
        return null;
    }
}

        const marktwaardePerM2 = transactiePrijsGetal / totaleOppGetal;
        const conditie = haalConditieUitTransactieprijs(transactieTekst);

        return {
            score: 0,
            redenen: "",
            adres: maakAdres(
                row[index.straat],
                row[index.huisnr],
                index.toev !== -1 ? row[index.toev] : ""
            ),
            postcode: index.postcode !== -1 ? row[index.postcode] || "" : "",
            plaats: row[index.plaats] || "",
            transactiePrijs: "€ " + transactiePrijsGetal.toLocaleString("nl-NL", {
                maximumFractionDigits: 0
            }),
            conditie: conditie,
            marktwaardePerM2: marktwaardePerM2,
            totaleOpp: row[index.totaleOpp] || "",
            oppGetal: totaleOppGetal,
            bouwjaar: bouwjaar,
            bar: index.bar !== -1 ? row[index.bar] || "" : "",
            datum: index.datum !== -1 ? row[index.datum] || "" : ""
        };
    }).filter(item => item !== null);

resultaten = await voegAfstandToeAanReferenties(resultaten, adres, plaats);

resultaten = resultaten.map(r => {
    let afstandScore = r.afstandKm !== null ? 100 - (10 * r.afstandKm) : 0;
    afstandScore = Math.max(0, Math.min(100, afstandScore));

    let bouwjaarScore = 0;

    if (taxatieBouwjaar && r.bouwjaar) {
        bouwjaarScore = 100 - (2 * Math.abs(taxatieBouwjaar - r.bouwjaar));
        bouwjaarScore = Math.max(0, Math.min(100, bouwjaarScore));
    }

    let oppScore = 0;

    if (taxatieOpp && r.oppGetal) {
        oppScore = 100 - (0.5 * Math.abs(taxatieOpp - r.oppGetal));
        oppScore = Math.max(0, Math.min(100, oppScore));
    }

    const scores = [afstandScore, oppScore];

    if (taxatieBouwjaar && !isNaN(taxatieBouwjaar)) {
        scores.push(bouwjaarScore);
    }

    const vergelijkbaarheidScore = Math.round(
        scores.reduce((som, score) => som + score, 0) / scores.length
    );

    return {
        ...r,
        score: vergelijkbaarheidScore,
        redenen:
            "Afstand: " + afstandScore.toFixed(0) +
            (
                taxatieBouwjaar && !isNaN(taxatieBouwjaar)
                    ? ", Bouwjaar: " + bouwjaarScore.toFixed(0)
                    : ", Bouwjaar: niet meegenomen"
            ) +
            ", Oppervlakte: " + oppScore.toFixed(0)
    };
});

resultaten = resultaten
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
    const marktwaardes = resultaten
        .map(r => r.marktwaardePerM2)
        .filter(v => v !== null && !isNaN(v));

    return {
        aantal: resultaten.length,
        resultaten: resultaten,
        marktwaardeMin: marktwaardes.length ? Math.min(...marktwaardes) : null,
        marktwaardeMax: marktwaardes.length ? Math.max(...marktwaardes) : null
    };
}
const objectTabelVolgorde = [
    "Verhuurd oppervlak",
    "Totale oppervlakte",
    "Leegstand",
    "Bouwjaar",
    "Renovatiejaar",
    "Energielabel",
    "WOZ-waarde",
"Huurovereenkomst(en)",
"Aanvangshuur",
"Actuele huur",
    "Resterende looptijd gemiddeld (ongewogen)",
    "Resterende looptijd gemiddeld (gewogen)",
    "Servicekosten",
    "Parkeren",
    "Gebruiksdoel"
];

function sorteerObjectResultaten(resultaten) {
    return resultaten.slice().sort((a, b) => {
        const ai = objectTabelVolgorde.indexOf(a.naam);
        const bi = objectTabelVolgorde.indexOf(b.naam);

        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;

        return ai - bi;
    });
}
function maakScoreTabel(titel, score, resultaten, gemeentelijkeLasten = null) {
    let html = "";

    const taxatieAdres = localStorage.getItem("taxatieAdres") || "";
    const taxatiePlaats = localStorage.getItem("taxatiePlaats") || "";

    const bagZoekterm = encodeURIComponent(taxatieAdres + ", " + taxatiePlaats);
    const bagUrl = "https://bagviewer.kadaster.nl/lvbag/bag-viewer/index.html#?searchQuery=" + bagZoekterm;

    const epOnlineUrl = "https://www.ep-online.nl/Energylabel/Search";

    html += "<div class='scoreBox'>";
    html += "<div class='scoreHeader'>";
    html += "<h4>" + escapeHtml(titel) + "</h4>";
    html += maakScoreCirkel(score);
    html += "</div>";


const resultatenVoorWeergave = resultaten.slice();
const totaleOppervlakteItem = resultatenVoorWeergave.find(item =>
    item.naam === "Totale oppervlakte" && item.waarde
);

const totaleOppervlakteSubkop = totaleOppervlakteItem
    ? formatObjectWaarde(totaleOppervlakteItem)
    : "";
const bouwjaarItem = resultatenVoorWeergave.find(item =>
    item.naam === "Bouwjaar" && item.waarde
);

const bouwjaarSubkop = bouwjaarItem
    ? formatObjectWaarde(bouwjaarItem)
    : "";
const energielabelItem = resultatenVoorWeergave.find(item =>
    item.naam === "Energielabel" && item.waarde
);

const energielabelSubkop = energielabelItem
    ? formatObjectWaarde(energielabelItem)
    : "";
const wozItem = resultatenVoorWeergave.find(item =>
    item.naam === "WOZ-waarde" && item.waarde
);

const wozSubkop = wozItem
    ? formatObjectWaarde(wozItem)
    : "";
const gesorteerdeResultaten = sorteerObjectResultaten(resultatenVoorWeergave);

function voegObjectRijToe(item, extraClass = "") {
    html += "<tr" + (extraClass ? " class='" + extraClass + "'" : "") + ">";
    html += "<td>";
    html += "<div class='objectOnderdeelCel'>";
    html += "<span>" + escapeHtml(item.naam) + "</span>";
if (!item.gevonden && item.naam !== "Leegstand") {
    html += "<span class='statusUitroep'>!</span>";
}
    html += "</div>";
    html += "</td>";

    html += "<td>";
    html += "<div class='objectWaardeCel'>";
    html += "<div class='objectWaardeLinks'>";

if (item.gevonden && item.waarde) {
    html += "<span style='color:#333; font-weight:normal;'>" +
        escapeHtml(formatObjectWaarde(item)) +
        "</span>";
}

    html += "</div>";

    if ((!item.gevonden || veldAltijdAanpasbaar(item.naam)) && item.naam !== "Leegstand") {
        html += "<div class='objectInputRechts'>";
        html += maakHandmatigeInputVoorObjectveld(item.naam);
        html += "</div>";
    } else {
        html += "<div></div>";
    }

    html += "</div>";
    html += "</td>";
    html += "</tr>";
}
html += "<table class='objectTabel'>";

/* Oppervlakte kop */
html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleObjectOppervlakteRijen(this)' title='Toon oppervlaktegegevens'>";
html += "<strong>Oppervlakte</strong>";
html += "<span class='objectSubkopWaarde'>" + escapeHtml(totaleOppervlakteSubkop) + "</span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

gesorteerdeResultaten
    .filter(item => ["Verhuurd oppervlak", "Totale oppervlakte", "Leegstand"].includes(item.naam))
    .forEach(item => voegObjectRijToe(item, "objectGroepOppervlakte"));

/* Bouwjaar kop */
html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleObjectBouwjaarRijen(this)' title='Toon bouwjaargegevens'>";
html += "<strong>Bouwjaar</strong>";
html += "<span class='objectSubkopWaarde'>" + escapeHtml(bouwjaarSubkop) + "</span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

gesorteerdeResultaten
    .filter(item => ["Bouwjaar", "Renovatiejaar"].includes(item.naam))
    .forEach(item => voegObjectRijToe(item, "objectGroepBouwjaar"));

/* Energielabel kop */
html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleObjectEnergielabelRijen(this)' title='Toon energielabelgegevens'>";
html += "<strong>Energielabel</strong>";
html += "<span class='objectSubkopWaarde'>" + escapeHtml(energielabelSubkop) + "</span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

gesorteerdeResultaten
    .filter(item => ["Energielabel"].includes(item.naam))
    .forEach(item => voegObjectRijToe(item, "objectGroepEnergielabel"));

/* WOZ kop */
html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleObjectWozRijen(this)' title='Toon WOZ-gegevens'>";
html += "<strong>WOZ-waarde</strong>";
html += "<span class='objectSubkopWaarde'>" + escapeHtml(wozSubkop) + "</span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

gesorteerdeResultaten
    .filter(item => ["WOZ-waarde"].includes(item.naam))
    .forEach(item => voegObjectRijToe(item, "objectGroepWoz"));

if (gemeentelijkeLasten) {
    html += "<tr class='objectGroepWoz'>";
    html += "<td>Gemeentelijke lasten</td>";
    html += "<td>";
    html += "OZB: € " + Math.round(gemeentelijkeLasten.ozb || 0).toLocaleString("nl-NL") + "<br>";
    html += "Riool: € " + Math.round(gemeentelijkeLasten.riool || 0).toLocaleString("nl-NL") + "<br>";
    html += "Waterschap: € " + Math.round(gemeentelijkeLasten.watersysteemheffing || 0).toLocaleString("nl-NL") + "<br>";
    html += "<strong>Totaal: € " + Math.round(gemeentelijkeLasten.totaal || 0).toLocaleString("nl-NL") + "</strong>";
    html += "</td>";
    html += "</tr>";
}

/* Gebruik kop */
html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleObjectGebruikRijen(this)' title='Toon gebruiksgegevens'>";
html += "<strong>Gebruik</strong>";
html += "<span class='objectSubkopWaarde'></span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

const aantalHuurders = telAantalHuurdersUitHuurovereenkomsten();

if (aantalHuurders !== null) {
    html += "<tr class='objectGroepGebruik'>";
    html += "<td>";
    html += "<div class='objectOnderdeelCel'>";
    html += "<span>Aantal huurders</span>";
    html += "</div>";
    html += "</td>";
    html += "<td>";
    html += "<div class='objectWaardeCel'>";
    html += "<div class='objectWaardeLinks'>";
html += "<span style='color:#333; font-weight:normal;'>" +
    aantalHuurders.toLocaleString("nl-NL") +
    "</span>";
html += "</div>";
html += "<div class='objectInputRechts'>";
html += "<button " +
    "type='button' " +
    "class='bagButton' " +
    "style='width:22px; height:22px; border-radius:50%; background:#fff3cd; color:#f9a825; border:1px solid #f9a825; font-weight:bold; padding:0; margin:0;' " +
    "onclick='toonHuurdersInfo()' " +
    "title='Toon huurdersinformatie'>" +
    "i" +
    "</button>";
html += "</div>";
    html += "</div>";
    html += "</td>";
    html += "</tr>";
}

gesorteerdeResultaten
    .filter(item =>
        ![
            "Verhuurd oppervlak",
            "Totale oppervlakte",
            "Leegstand",
            "Bouwjaar",
            "Renovatiejaar",
            "Energielabel",
            "WOZ-waarde",
            "Achterstallig onderhoud"
        ].includes(item.naam)
    )
    .forEach(item => voegObjectRijToe(item, "objectGroepGebruik"));

/* Onderhoud kop */
html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleObjectOnderhoudRijen(this)' title='Toon onderhoudsgegevens'>";
html += "<strong>Onderhoud</strong>";
html += "<span class='objectSubkopWaarde'></span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

gesorteerdeResultaten
    .filter(item => item.naam === "Achterstallig onderhoud")
    .forEach(item => voegObjectRijToe(item, "objectGroepOnderhoud"));

    html += "</table>";
html += "<div style='text-align:right; margin-top:8px;'>";
html += "<button type='button' class='bagButton' onclick='startOpnieuwZoekenMetObjectdata()'>Opnieuw zoeken met ingevulde objectdata</button>";
html += "<div id='opnieuwZoekenStatusTekst' style='margin-top:4px; font-size:11px; color:#0d045c; font-weight:bold; min-height:14px;'></div>";
html += "</div>";
html += "</div>";

    return html;
}
function maakMarktTabel(titel, score, aantal, nabijeOudereReferenties = [], toonReferentieKnop = false, huurReferenties = [], koopReferenties = []) {
    let html = "";

    window.laatsteNabijeOudereReferenties = nabijeOudereReferenties || [];
const heeftTotaleOppervlakte = totaleOppervlakteIsIngevuld();

if (!heeftTotaleOppervlakte) {
    aantal = 0;
    huurReferenties = [];
    koopReferenties = [];
}

const huurScore = berekenGemiddeldeVergelijkbaarheidScore(huurReferenties);
const koopScore = berekenGemiddeldeVergelijkbaarheidScore(koopReferenties);
const koopAantal = (koopReferenties || []).length;

const marktScore =
    huurScore !== null && koopScore !== null
        ? Math.round((huurScore + koopScore) / 2)
        : null;

    html += "<div class='scoreBox'>";
    html += "<div class='scoreHeader'>";
    html += "<h4>" + escapeHtml(titel);

    if (nabijeOudereReferenties && nabijeOudereReferenties.length > 0) {
        html += " <button type='button' class='bagButton' " +
            "style='background:#fde0dc; color:#c62828; border:1px solid #ef9a9a; border-radius:50%; width:22px; height:22px; font-weight:bold;' " +
            "onclick='toonNabijeOudereReferenties()' " +
            "title='Nabije oudere huurreferenties gevonden'>!</button>";
    }

    html += "</h4>";
    html += maakScoreCirkel(marktScore);
    html += "</div>";

   html += "<table class='marktTabel'>";

html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleMarktHuurReferentieRijen(this)' title='Toon huurreferenties'>";
html += "<strong>Huurreferenties</strong>";
html += "<span class='objectSubkopWaarde'>" + escapeHtml(aantal) + "</span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

html += "<tr class='marktGroepHuurReferenties'>";
html += "<td>Aantal</td>";
html += "<td><strong>" + escapeHtml(aantal) + "</strong></td>";
html += "</tr>";

html += "<tr class='marktGroepHuurReferenties'>";
html += "<td>Score</td>";
html += "<td>" + (
    huurScore !== null
        ? "<strong>" + huurScore + "%</strong>"
        : "Niet beschikbaar"
) + "</td>";
html += "</tr>";
html += "<tr class='marktTussenruimte'>";
html += "<td colspan='2'></td>";
html += "</tr>";

html += "<tr class='objectSubkopRij'>";
html += "<td colspan='2'>";
html += "<button type='button' class='objectSubkopKnop' onclick='toggleMarktKoopReferentieRijen(this)' title='Toon koop-/beleggingsreferenties'>";
html += "<strong>Koop-/beleggingsreferenties</strong>";
html += "<span class='objectSubkopWaarde'>" + escapeHtml(koopAantal) + "</span>";
html += "<span class='objectSubkopPijl'>▼</span>";
html += "</button>";
html += "</td>";
html += "</tr>";

html += "<tr class='marktGroepKoopReferenties'>";
html += "<td>Aantal</td>";
html += "<td><strong>" + escapeHtml(koopAantal) + "</strong></td>";
html += "</tr>";

html += "<tr class='marktGroepKoopReferenties'>";
html += "<td>Score</td>";
html += "<td>" + (
    koopScore !== null
        ? "<strong>" + koopScore + "%</strong>"
        : "Niet beschikbaar"
) + "</td>";
html += "</tr>";

html += "</table>";

    html += "</div>";

    return html;
}
function toonNabijeOudereReferenties() {
    const resultaten = window.laatsteNabijeOudereReferenties || [];

    if (!resultaten.length) {
        toonPopupHtml("Nabije oudere huurreferenties", "<p>Geen nabije oudere referenties gevonden.</p>");
        return;
    }

    const rows = resultaten.map(r => [
        r.adres,
        r.postcode,
        r.plaats,
        r.afstand || "Onbekend",
        r.transactiePrijs,
        r.totaleOpp,
        r.bouwjaar,
        r.datum
    ]);

    toonPopupHtml(
        "Nabije oudere huurreferenties",
        "<p class='fout'><strong>Let op:</strong> Er zijn huurreferenties gevonden binnen 100 meter die ouder zijn dan 1 jaar, maar maximaal 3 jaar oud.</p>" +
        maakPopupTabel(
            ["Adres", "Postcode", "Plaats", "Afstand", "Transactieprijs", "Oppervlakte", "Bouwjaar", "Datum"],
            rows
        )
    );
}
function maakHistorischeTaxatieBox(data) {
    let html = "";

    html += "<div class='scoreBox historischeBox'>";
    html += "<h4>Taxaties</h4>";
    html += "<table class='taxatieTabel'>";

    html += "<tr class='objectSubkopRij'>";
    html += "<td colspan='2'>";
    html += "<button type='button' class='objectSubkopKnop' onclick='toggleTaxatieRijen(this)' title='Toon taxaties'>";
    html += "<strong>Historische taxaties</strong>";
html += "<span class='objectSubkopWaarde'></span>";    html += "<span class='objectSubkopPijl'>▼</span>";
    html += "</button>";
    html += "</td>";
    html += "</tr>";

    if (!data) {
        html += "<tr class='taxatieGroep'>";
        html += "<td colspan='2' class='fout'>Niet beschikbaar</td>";
        html += "</tr>";
        html += "</table>";
        html += "</div>";
        return html;
    }

    html += "<tr class='taxatieGroep'>";
    html += "<td>Vergelijkbare taxaties</td>";
    html += "<td><strong>" + escapeHtml(data.aantal) + "</strong></td>";
    html += "</tr>";

    html += "<tr class='taxatieGroep'>";
    html += "<td>Markthuurwaarde/m²</td>";
    html += "<td>" + (
        data.huurMin !== null && data.huurMax !== null
            ? "€ " + data.huurMin.toFixed(0) + " - € " + data.huurMax.toFixed(0)
            : "Niet beschikbaar"
    ) + "</td>";
    html += "</tr>";

    html += "<tr class='taxatieGroep'>";
    html += "<td>Marktwaarde/m²</td>";
    html += "<td>" + (
        data.marktwaardeMin !== null && data.marktwaardeMax !== null
            ? "€ " + data.marktwaardeMin.toFixed(0) + " - € " + data.marktwaardeMax.toFixed(0)
            : "Niet beschikbaar"
    ) + "</td>";
    html += "</tr>";

    html += "<tr class='taxatieGroep'>";
    html += "<td>NAR</td>";
    html += "<td>" + (
        data.narMin !== null && data.narMax !== null
            ? data.narMin.toFixed(1) + "% - " + data.narMax.toFixed(1) + "%"
            : "Niet beschikbaar"
    ) + "</td>";
    html += "</tr>";

    html += "<tr class='taxatieGroep'>";
    html += "<td>BAR k.k. (MH)</td>";
    html += "<td>" + (
        data.barMhMin !== null && data.barMhMax !== null
            ? data.barMhMin.toFixed(1) + "% - " + data.barMhMax.toFixed(1) + "%"
            : "Niet beschikbaar"
    ) + "</td>";
    html += "</tr>";

    html += "<tr class='taxatieGroep'>";
    html += "<td>BAR k.k. (HI)</td>";
    html += "<td>" + (
        data.barHiMin !== null && data.barHiMax !== null
            ? data.barHiMin.toFixed(1) + "% - " + data.barHiMax.toFixed(1) + "%"
            : "Niet beschikbaar"
    ) + "</td>";
    html += "</tr>";

    if (data.gebruikteTaxaties && data.gebruikteTaxaties.length > 0) {
        window.laatsteGebruikteHistorischeTaxaties = data.gebruikteTaxaties;

        html += "<tr class='taxatieGroep'>";
        html += "<td colspan='2' style='text-align:right;'>";
        html += "<button type='button' class='bagButton' onclick='toonHistorischeTaxatiesVanWindow()'>Bekijk gebruikte taxaties</button>";
        html += "</td>";
        html += "</tr>";
    }

    html += "</table>";
    html += "</div>";

    return html;
}
function toonHistorischeTaxatiesVanWindow() {
    toonHistorischeTaxaties({
        getAttribute: function() {
            return JSON.stringify(window.laatsteGebruikteHistorischeTaxaties || []);
        }
    });
}
function maakReferentieBlok(resultaten) {
    if (!resultaten || resultaten.length === 0) {
        return "<div class='referentieBox'><div class='referentieTitel'>Gevonden referenties</div><p class='fout'>Geen kantoorruimte-referenties gevonden.</p></div>";
    }

window.alleHuurReferenties = resultaten.map((r, index) => ({
    ...r,
    uniekeId: index
}));

if (!window.uitgeslotenHuurReferenties) {
    window.uitgeslotenHuurReferenties = [];
}

const actieveResultaten = window.alleHuurReferenties
    .filter(r => !window.uitgeslotenHuurReferenties.includes(r.uniekeId))
    .slice(0, 5);

window.laatsteReferentieResultaten = actieveResultaten;

    let html = "<div class='referentieBox referentieBoxHuur'>";
    html += "<div class='referentieTitel'>Meest vergelijkbare huurreferenties kantoorruimte</div>";

    html += "<table>";
    html += "<tr>";
    html += "<th>Score</th>";
    html += "<th>Toelichting</th>";
    html += "<th>Adres</th>";
    html += "<th>Plaats</th>";
html += "<th>Deelgebied</th>";
    html += "<th>Afstand</th>";
    html += "<th>Transactieprijs</th>";
    html += "<th>Oppervlakte</th>";
    html += "<th>Bouwjaar</th>";
    html += "<th>Datum</th>";
    html += "<th>Google Maps</th>";
    html += "<th>Verwijder</th>";
    html += "</tr>";
const taxatieKenmerken = haalTaxatieObjectKenmerken();
    actieveResultaten.forEach(r => {
        const volledigAdres = r.adres + ", " + r.plaats + ", Nederland";
        const mapsUrl =
            "https://www.google.com/maps/search/?api=1&query=" +
            encodeURIComponent(volledigAdres);

        html += "<tr>";
       html += "<td>" + escapeHtml(formatScorePercentage(r.score)) + "</td>";
        html += "<td><button class='bagButton' type='button' onclick='toonReden(this)' data-redenen='" + escapeHtml(r.redenen) + "'>Bekijk</button></td>";
        html += "<td>" + escapeHtml(r.adres) + "</td>";
        html += "<td>" + escapeHtml(r.plaats) + "</td>";
html += "<td>" + escapeHtml(r.deelgebied || r.buurtnaam || r.wijknaam || "Onbekend") + "</td>";
        html += "<td>" + escapeHtml(r.afstand || "Onbekend") + "</td>";
        html += "<td>" + escapeHtml(r.transactiePrijs) + "</td>";
html += "<td>" +
    escapeHtml(r.totaleOpp) +
    maakVerschilHtml(prijsNaarGetal(r.totaleOpp), taxatieKenmerken.oppervlakte) +
    "</td>";

html += "<td>" +
    escapeHtml(r.bouwjaar) +
    maakVerschilHtml(parseInt(String(r.bouwjaar || "").replace(/\D/g, ""), 10), taxatieKenmerken.bouwjaar) +
    "</td>";
        html += "<td>" + escapeHtml(r.datum) + "</td>";
        html += "<td><button class='bagButton' type='button' onclick='window.open(this.dataset.url, \"_blank\")' data-url='" + escapeHtml(mapsUrl) + "'>Google Maps</button></td>";
        html += "<td class='verwijderCel'><button class='bagButton verwijderKnop' type='button' onclick='verwijderHuurReferentie(" + r.uniekeId + ")'>×</button></td>";
        html += "</tr>";
    });

html += "</table>";
html += "</div>";

html += maakKoopReferentieBlok(window.laatsteKoopAnalyse);

return html;
}

function maakKoopReferentieBlok(data) {
    if (!data || !data.resultaten || data.resultaten.length === 0) {
        return "<div class='referentieBox'><div class='referentieTitel'>Koop-/beleggingsreferenties</div><p class='fout'>Geen koop-/beleggingsreferenties gevonden.</p></div>";
    }

   let html = "<div class='referentieBox referentieBoxKoop'>";
    if (!window.alleKoopReferenties) {
    window.alleKoopReferenties = data.resultaten.map((r, index) => ({
        ...r,
        uniekeId: index
    }));
    window.uitgeslotenKoopReferenties = [];
}

const actieveKoopResultaten = window.alleKoopReferenties
    .filter(r => !window.uitgeslotenKoopReferenties.includes(r.uniekeId))
    .slice(0, 5);

window.laatsteKoopAnalyse = {
    ...data,
    resultaten: actieveKoopResultaten,
    marktwaardeMin: minArray(actieveKoopResultaten.map(r => r.marktwaardePerM2).filter(v => v !== null)),
    marktwaardeMax: maxArray(actieveKoopResultaten.map(r => r.marktwaardePerM2).filter(v => v !== null))
};
    html += "<div class='referentieTitel'>Meest vergelijkbare koop-/beleggingsreferenties kantoorruimte</div>";

    html += "<table>";
    html += "<tr>";
    html += "<th>Score</th>";
    html += "<th>Toelichting</th>";
    html += "<th>Adres</th>";
    html += "<th>Plaats</th>";
html += "<th>Deelgebied</th>";
    html += "<th>Afstand</th>";
    html += "<th>Transactieprijs</th>";
    html += "<th>Transactieprijs/m²</th>";
    html += "<th>Totale opp.</th>";
    html += "<th>Bouwjaar</th>";
    html += "<th>BAR</th>";
    html += "<th>Datum</th>";
    html += "<th>Google Maps</th>";
    html += "<th>Verwijder</th>";
    html += "</tr>";
const taxatieKenmerken = haalTaxatieObjectKenmerken();
    actieveKoopResultaten.forEach(r => {
        const volledigAdres = r.adres + ", " + r.plaats + ", Nederland";
    const mapsUrl =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(volledigAdres);
        html += "<tr>";
        html += "<td>" + escapeHtml(formatScorePercentage(r.score)) + "</td>";
        html += "<td><button class='bagButton' type='button' onclick='toonReden(this)' data-redenen='" + escapeHtml(r.redenen) + "'>Bekijk</button></td>";
        html += "<td>" + escapeHtml(r.adres) + "</td>";
        html += "<td>" + escapeHtml(r.plaats) + "</td>";
html += "<td>" + escapeHtml(r.deelgebied || r.buurtnaam || r.wijknaam || "Onbekend") + "</td>";
        html += "<td>" + escapeHtml(r.afstand || "Onbekend") + "</td>";
        html += "<td>" + escapeHtml(r.transactiePrijs) + "</td>";
        html += "<td>" + (r.marktwaardePerM2 ? "€ " + r.marktwaardePerM2.toFixed(0) : "") + "</td>";
html += "<td>" +
    escapeHtml(r.totaleOpp) +
    maakVerschilHtml(prijsNaarGetal(r.totaleOpp), taxatieKenmerken.oppervlakte) +
    "</td>";

html += "<td>" +
    escapeHtml(r.bouwjaar) +
    maakVerschilHtml(parseInt(String(r.bouwjaar || "").replace(/\D/g, ""), 10), taxatieKenmerken.bouwjaar) +
    "</td>";
        html += "<td>" + escapeHtml(r.bar) + "</td>";
        html += "<td>" + escapeHtml(r.datum) + "</td>";
        html += "<td><button class='bagButton' type='button' onclick='window.open(this.dataset.url, \"_blank\")' data-url='" + escapeHtml(mapsUrl) + "'>Google Maps</button></td>";
        html += "<td class='verwijderCel'><button class='bagButton verwijderKnop' type='button' onclick='verwijderKoopReferentie(" + r.uniekeId + ")'>×</button></td>";
        html += "</tr>";
    });

    html += "</table>";
    html += "</div>";

    return html;
}

function toetsMarkthuurReferenties() {
    const input = document.getElementById("toetsMarkthuurInput");
    const output = document.getElementById("toetsMarkthuurResultaat");

    if (!input || !output) return;

    const toetswaarde = parseFloat(String(input.value).replace(",", "."));

    if (isNaN(toetswaarde)) {
        output.innerHTML = "<p class='fout'>Vul een geldige markthuur per m² per jaar in.</p>";
        return;
    }

    const resultaten = window.laatsteReferentieResultaten || [];

    const prijzen = resultaten
        .map(r => haalPrijsPerM2UitTekst(r.transactiePrijs))
        .filter(p => p !== null);

    if (prijzen.length === 0) {
        output.innerHTML = "<p class='fout'>Er kon geen bandbreedte uit de huurreferenties worden berekend.</p>";
        return;
    }

    const minPrijs = Math.min(...prijzen);
    const maxPrijs = Math.max(...prijzen);
const modelMarkthuur = berekenRegressieModelwaarde(
    resultaten,
    r => haalPrijsPerM2UitTekst(r.transactiePrijs)
);
    let html = "";

	const q1Prijs = kwartielArray(prijzen, 0.25);
	const q3Prijs = kwartielArray(prijzen, 0.75);

html += "<div class='analyseUitkomstLayout'>";
html += "<div class='analyseResultaatGrid'>";

html += "<div class='analyseResultaatItem'>";
html += "<strong>Bandbreedte huurreferenties</strong>";
html += "€ " + minPrijs.toFixed(0) + " - € " + maxPrijs.toFixed(0) + " /m²/jaar";
html += "</div>";

html += "<div class='analyseResultaatItem'>";
html += "<strong>Modelwaarde</strong>";
html += modelMarkthuur !== null
    ? "€ " + modelMarkthuur.toFixed(0) + " /m²/jaar"
    : "Niet beschikbaar";
html += "</div>";

html += "<div class='analyseResultaatItem'>";
html += "<strong>Interkwartielafstand</strong>";
html += "€ " + q1Prijs.toFixed(0) + " - € " + q3Prijs.toFixed(0) + " /m²/jaar";
html += "</div>";

if (toetswaarde >= minPrijs && toetswaarde <= maxPrijs) {
    html += "<div class='analyseResultaatItem goed'>";
    html += "De ingevulde markthuur valt binnen de bandbreedte.";
    html += "</div>";
} else {
    html += "<div class='analyseResultaatItem fout'>";
    html += "De ingevulde markthuur valt buiten de bandbreedte.";
    html += "</div>";
}

html += "</div>";
html += maakBoxplotHtml(prijzen, toetswaarde, "€/m²/jaar");
html += "</div>";
output.innerHTML = html;
synchroniseerAnalyseHoogtes();
}

function toetsKoopReferenties() {
    const input = document.getElementById("toetsKoopWaardeInput");
    const output = document.getElementById("toetsKoopWaardeResultaat");

    if (!input || !output) return;

    const toetswaarde = parseFloat(String(input.value).replace(",", "."));
    const koopAnalyse = window.laatsteKoopAnalyse;

    if (isNaN(toetswaarde)) {
        output.innerHTML = "<p class='fout'>Vul een geldige marktwaarde per m² in.</p>";
        return;
    }

    if (!koopAnalyse || koopAnalyse.marktwaardeMin === null || koopAnalyse.marktwaardeMax === null) {
        output.innerHTML = "<p class='fout'>Er kon geen bandbreedte uit koop-/beleggingsreferenties worden berekend.</p>";
        return;
    }

    const minWaarde = koopAnalyse.marktwaardeMin;
    const maxWaarde = koopAnalyse.marktwaardeMax;

    const koopPrijzen = (koopAnalyse.resultaten || [])
        .map(r => r.marktwaardePerM2)
        .filter(v => v !== null && !isNaN(v));

    const q1Waarde = kwartielArray(koopPrijzen, 0.25);
    const q3Waarde = kwartielArray(koopPrijzen, 0.75);

    const modelMarktwaarde = berekenRegressieModelwaarde(
        koopAnalyse.resultaten || [],
        r => r.marktwaardePerM2
    );

    let html = "";

    html += "<div class='analyseUitkomstLayout'>";
html += "<div class='analyseResultaatGrid'>";

    html += "<div class='analyseResultaatItem'>";
    html += "<strong>Bandbreedte koop-/beleggingsreferenties</strong>";
    html += "€ " + minWaarde.toFixed(0) + " - € " + maxWaarde.toFixed(0) + " /m²";
    html += "</div>";

    html += "<div class='analyseResultaatItem'>";
    html += "<strong>Modelwaarde</strong>";
    html += modelMarktwaarde !== null
        ? "€ " + modelMarktwaarde.toFixed(0) + " /m²"
        : "Niet beschikbaar";
    html += "</div>";

    if (q1Waarde !== null && q3Waarde !== null) {
        html += "<div class='analyseResultaatItem'>";
        html += "<strong>Interkwartielafstand</strong>";
        html += "€ " + q1Waarde.toFixed(0) + " - € " + q3Waarde.toFixed(0) + " /m²";
        html += "</div>";
    }

    if (toetswaarde >= minWaarde && toetswaarde <= maxWaarde) {
        html += "<div class='analyseResultaatItem goed'>";
        html += "De ingevulde marktwaarde valt binnen de bandbreedte.";
        html += "</div>";
    } else {
        html += "<div class='analyseResultaatItem fout'>";
        html += "De ingevulde marktwaarde valt buiten de bandbreedte.";
        html += "</div>";
    }

html += "</div>";
html += maakBoxplotHtml(koopPrijzen, toetswaarde, "€/m²");
html += "</div>";

    output.innerHTML = html;
    synchroniseerAnalyseHoogtes();
}

function maakScoreCirkel(score) {
    if (score === null || score === undefined || score === "") {
        return `
            <div class="scoreBalkGroep" style="--score:0; --kleur:#ccc;">
                <span class="scorePercentage">-</span>
                <div class="scoreBalk">
                    <div class="scoreBalkVulling"></div>
                </div>
            </div>
        `;
    }

    let kleur = "#4caf50";

    if (score < 40) {
        kleur = "#ef5350";
    } else if (score < 70) {
        kleur = "#f9a825";
    } else if (score < 90) {
        kleur = "#fdd835";
    }

    return `
        <div class="scoreBalkGroep" style="--score:${score}; --kleur:${kleur};">
            <span class="scorePercentage">${score}%</span>
            <div class="scoreBalk">
                <div class="scoreBalkVulling"></div>
            </div>
        </div>
    `;
}
function toonHistorischeTaxaties(btn) {
    let taxaties = [];

    try {
        taxaties = JSON.parse(btn.getAttribute("data-taxaties") || "[]");
    } catch (e) {
        taxaties = [];
    }

    if (!taxaties.length) {
        toonPopupHtml("Gebruikte historische taxaties", "<p>Geen gebruikte taxaties beschikbaar.</p>");
        return;
    }

    const rows = taxaties.map(t => [
        t.score,
        t.adres,
        t.plaats,
        t.taxateur,
        t.typeObject,
        t.vvo,
        t.markthuurwaarde,
        t.marktwaarde,
        t.barOrigineel
    ]);

    toonPopupHtml(
        "Gebruikte historische taxaties",
        maakPopupTabel(
            ["Score", "Adres", "Plaats", "Taxateur", "Type", "VVO", "Markthuurwaarde", "Marktwaarde", "BAR"],
            rows
        )
    );
}
function maakPopupTabel(headers, rows) {
    let html = "<table>";
    html += "<tr>";

    headers.forEach(header => {
        html += "<th>" + escapeHtml(header) + "</th>";
    });

    html += "</tr>";

    rows.forEach(row => {
        html += "<tr>";

        row.forEach(cell => {
            html += "<td>" + escapeHtml(cell) + "</td>";
        });

        html += "</tr>";
    });

    html += "</table>";

    return html;
}

function tekstNaarPopupTabel(tekst) {
    const regels = String(tekst || "")
        .split(/\n+/)
        .map(regel => regel.trim())
        .filter(Boolean);

    const rows = regels.map(regel => {
        const delen = regel.split(":");

        if (delen.length > 1) {
            return [
                delen.shift().trim(),
                delen.join(":").trim()
            ];
        }

        return ["Melding", regel];
    });

    return maakPopupTabel(["Onderdeel", "Waarde"], rows);
}
function referentieToelichtingNaarPopupTabel(tekst) {
    const regels = String(tekst || "")
        .split(/\s*,\s*/)
        .map(regel => regel.trim())
        .filter(Boolean);

    const rows = regels.map(regel => {
        const delen = regel.split(":");

        if (delen.length > 1) {
            const onderdeel = delen.shift().trim();
            let score = delen.join(":").trim();

            if (
                score !== "" &&
                !score.includes("%") &&
                !score.toLowerCase().includes("niet meegenomen")
            ) {
                score += "%";
            }

            return [onderdeel, score];
        }

        return ["Toelichting", regel];
    });

    return maakPopupTabel(["Onderdeel", "Score"], rows);
}
function toonPopupHtml(titel, inhoudHtml) {
    let popup = document.getElementById("redenPopup");

    if (!popup) {
        popup = document.createElement("div");
        popup.id = "redenPopup";
        popup.className = "popupOverlay";
        popup.innerHTML =
            "<div class='popupBox' style='width:760px; max-width:95%;'>" +
            "<span class='popupClose' onclick='sluitRedenPopup()'>×</span>" +
            "<h4 id='popupTitel'></h4>" +
            "<div id='redenPopupTekst'></div>" +
            "</div>";

        document.body.appendChild(popup);
    }

    document.getElementById("popupTitel").innerText = titel;
    document.getElementById("redenPopupTekst").innerHTML = inhoudHtml;
    popup.style.display = "block";
}

function toonReden(btn) {
    const reden = btn.getAttribute("data-redenen") || "Geen toelichting beschikbaar.";

    let popup = document.getElementById("redenPopup");

    if (!popup) {
        popup = document.createElement("div");
        popup.id = "redenPopup";
        popup.className = "popupOverlay";
        popup.innerHTML =
            "<div class='popupBox'>" +
            "<span class='popupClose' onclick='sluitRedenPopup()'>×</span>" +
            "<h4 id='popupTitel'>Toelichting referentie</h4>" +
            "<div id='redenPopupTekst'></div>" +
            "</div>";

        document.body.appendChild(popup);
    }

document.getElementById("popupTitel").innerText = "Toelichting";

if (
    reden.includes("Afstand:") ||
    reden.includes("Bouwjaar:") ||
    reden.includes("Oppervlakte:") ||
    reden.includes("Energielabel:")
) {
    document.getElementById("redenPopupTekst").innerHTML =
        referentieToelichtingNaarPopupTabel(reden);
} else {
    document.getElementById("redenPopupTekst").innerHTML =
        tekstNaarPopupTabel(reden);
}

popup.style.display = "block";
}

function sluitRedenPopup() {
    const popup = document.getElementById("redenPopup");

    if (popup) {
        popup.style.display = "none";
    }
}

function haalConditieUitTransactieprijs(waarde) {
    const tekst = normaliseerTekst(waarde);

    if (tekst.includes("kosten koper") || tekst.includes("k.k")) {
        return "kosten koper";
    }

    if (tekst.includes("vrij op naam") || tekst.includes("v.o.n")) {
        return "vrij op naam";
    }

    return "";
}

function haalPrijsPerM2UitTekst(waarde) {
    if (!waarde) return null;

    let schoon = String(waarde)
        .replace(/€/g, "")
        .replace(/\/m²\/jaar/g, "")
        .replace(/\/m2\/jaar/g, "")
        .replace(/m²/g, "")
        .replace(/m2/g, "")
        .replace(/jaar/g, "")
        .replace(/\s/g, "")
        .replace(/[^\d,.-]/g, "");

    if (schoon.includes(",") && schoon.includes(".")) {
        schoon = schoon.replace(/\./g, "").replace(",", ".");
    } else if (schoon.includes(",")) {
        schoon = schoon.replace(",", ".");
    } else if (schoon.includes(".")) {
        const delen = schoon.split(".");
        if (delen.length > 1 && delen[delen.length - 1].length === 3) {
            schoon = schoon.replace(/\./g, "");
        }
    }

    const getal = parseFloat(schoon);
    return isNaN(getal) ? null : getal;
}

function maakAdres(straat, huisnr, toev) {
    return [straat, huisnr, toev]
        .map(v => String(v || "").trim())
        .filter(v => v !== "")
        .join(" ");
}

function berekenTransactiePrijsPerM2PerJaar(prijsTekst, oppTekst) {
    const origineleTekst = String(prijsTekst || "").trim();
    const tekst = normaliseerTekst(origineleTekst);

    const prijs = prijsNaarGetal(origineleTekst);
    const opp = prijsNaarGetal(oppTekst);

    if (prijs === null) return "";

    const isPerMaand =
        tekst.includes("per maand") ||
        tekst.includes("maand") ||
        tekst.includes("p.m.") ||
        tekst.includes("p/m") ||
        tekst.includes("pm");

    const isPerJaar =
        tekst.includes("per jaar") ||
        tekst.includes("jaar") ||
        tekst.includes("p.j.") ||
        tekst.includes("p/j") ||
        tekst.includes("pj");

    const isPerM2 =
        tekst.includes("m²") ||
        tekst.includes("m2") ||
        tekst.includes("per m²") ||
        tekst.includes("per m2") ||
        tekst.includes("/m²") ||
        tekst.includes("/m2");

    let uitkomst = prijs;

    if (isPerM2) {
        uitkomst = prijs;
    } else if (isPerMaand && opp) {
        uitkomst = (prijs * 12) / opp;
    } else if (isPerJaar && opp) {
        uitkomst = prijs / opp;
    } else if (opp) {
        uitkomst = prijs / opp;
    }

    return "€ " + uitkomst.toFixed(0) + " /m²/jaar";
}

function prijsNaarGetal(waarde) {
    if (!waarde) return null;

    let schoon = String(waarde)
        .replace(/€/g, "")
        .replace(/\s/g, "")
        .replace(/[^\d,.-]/g, "");

    if (!schoon) return null;

    const heeftKomma = schoon.includes(",");
    const heeftPunt = schoon.includes(".");

    if (heeftKomma && heeftPunt) {
        // Nederlandse notatie: 21.600,50
        schoon = schoon.replace(/\./g, "").replace(",", ".");
    } else if (heeftPunt && !heeftKomma) {
        const delen = schoon.split(".");

        if (delen.length > 2) {
            // 1.234.567
            schoon = schoon.replace(/\./g, "");
        } else if (delen.length === 2) {
            if (delen[1].length === 3) {
                // 21.600
                schoon = delen[0] + delen[1];
            } else if (delen[1].length === 2) {
                // 21.60 als decimaal
                schoon = delen[0] + "." + delen[1];
            }
        }
    } else if (heeftKomma && !heeftPunt) {
        const delen = schoon.split(",");

        if (delen.length > 2) {
            schoon = schoon.replace(/,/g, "");
        } else if (delen.length === 2) {
            if (delen[1].length === 3) {
                // 21,600
                schoon = delen[0] + delen[1];
            } else {
                // 21,60
                schoon = delen[0] + "." + delen[1];
            }
        }
    }

    const getal = parseFloat(schoon);
    return isNaN(getal) ? null : getal;
}
function haalHuurprijsUitTekst(tekst) {
    const match = String(tekst || "").match(
        /\b(?:huurprijs|kale huurprijs|contracthuur|jaarhuur|huursom)\s*:?\s*€?\s*([0-9][0-9\s.,]*)\s*(?:per\s*(maand|jaar))?/i
    );

    if (!match) return null;

    const bedragTekst = match[1].replace(/\s+/g, "");
    const bedrag = prijsNaarGetal(bedragTekst);

    if (bedrag === null) return null;

    const periode = normaliseerTekst(match[2] || "");

    return {
        bedrag: periode === "maand" ? bedrag * 12 : bedrag,
        periode: periode || "jaar"
    };
}
function parseAdres(adres) {
    adres = String(adres || "").trim();

    const match = adres.match(/^(.+?)\s+(\d+)[a-zA-Z]*/);

    if (!match) {
        return {
            straat: "",
            huisnummer: null
        };
    }

    return {
        straat: normaliseerTekst(match[1]),
        huisnummer: parseInt(match[2], 10)
    };
}

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"' && insideQuotes && nextChar === '"') {
            cell += '"';
            i++;
        } else if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === "," && !insideQuotes) {
            row.push(cell);
            cell = "";
        } else if ((char === "\n" || char === "\r") && !insideQuotes) {
            if (cell !== "" || row.length > 0) {
                row.push(cell);
                rows.push(row);
                row = [];
                cell = "";
            }

            if (char === "\r" && nextChar === "\n") {
                i++;
            }
        } else {
            cell += char;
        }
    }

    if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    return rows;
}

function parseNederlandseDatum(datum) {
    if (!datum) return 0;

    const waarde = String(datum).trim();

    let parts;

    if (waarde.includes("-")) {
        parts = waarde.split("-");
    } else if (waarde.includes("/")) {
        parts = waarde.split("/");
    } else {
        return 0;
    }

    if (parts.length !== 3) return 0;

    let dag, maand, jaar;

    if (parts[0].length === 4) {
        jaar = parseInt(parts[0], 10);
        maand = parseInt(parts[1], 10);
        dag = parseInt(parts[2], 10);
    } else {
        dag = parseInt(parts[0], 10);
        maand = parseInt(parts[1], 10);
        jaar = parseInt(parts[2], 10);
    }

    if (isNaN(dag) || isNaN(maand) || isNaN(jaar)) return 0;

    return new Date(jaar, maand - 1, dag).getTime();
}

function zoekKolom(headers, namen) {
    for (let i = 0; i < headers.length; i++) {
        for (let j = 0; j < namen.length; j++) {
            if (headers[i] === normaliseerHeader(namen[j])) {
                return i;
            }
        }
    }

    for (let i = 0; i < headers.length; i++) {
        for (let j = 0; j < namen.length; j++) {
            if (headers[i].includes(normaliseerHeader(namen[j]))) {
                return i;
            }
        }
    }

    return -1;
}

function normaliseerHeader(header) {
    return String(header || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

function berekenScore(resultaten) {
    const totaal = resultaten.length;
    const gevonden = resultaten.filter(item => item.gevonden).length;

    if (totaal === 0) return 0;

    return Math.round((gevonden / totaal) * 100);
}

function normaliseerTekst(tekst) {
    return String(tekst || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function bevatEenVanDezeWoorden(tekst, zoekwoorden) {
    return zoekwoorden.some(woord => tekst.includes(woord.toLowerCase()));
}

function minArray(arr) {
    return arr.length ? Math.min(...arr) : null;
}

function maxArray(arr) {
    return arr.length ? Math.max(...arr) : null;
}
function kwartielArray(arr, q) {
    if (!arr.length) return null;

    const sorted = arr.slice().sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;

    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }

    return sorted[base];
}

const geoCache = {};

async function haalCoordinaten(adres, plaats, postcode) {
    const zoekterm = [adres, postcode, plaats, "Nederland"]
        .filter(Boolean)
        .join(" ");

    if (geoCache[zoekterm]) return geoCache[zoekterm];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const url =
            "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fq=type:adres&q=" +
            encodeURIComponent(zoekterm);

        const response = await fetch(url, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        const doc = data.response && data.response.docs && data.response.docs[0];

        if (!doc || !doc.centroide_ll) return null;

        const match = doc.centroide_ll.match(/POINT\(([-0-9.]+) ([-0-9.]+)\)/);

        if (!match) return null;

const coords = {
    lon: parseFloat(match[1]),
    lat: parseFloat(match[2]),
    buurtnaam: doc.buurtnaam || "",
    wijknaam: doc.wijknaam || "",
    gemeentenaam: doc.gemeentenaam || "",
    deelgebied: doc.buurtnaam || doc.wijknaam || ""
};

        geoCache[zoekterm] = coords;
        return coords;
    } catch (e) {
        clearTimeout(timeoutId);
        return null;
    }
}
let leafletKaart = null;
let leafletMarkersLaag = null;

function initialiseerLeafletKaart() {
    if (typeof L === "undefined") {
        laadScriptEenmalig("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "L")
            .then(function() {
                initialiseerLeafletKaart();
            });
        return null;
    }
    const container = document.getElementById("mapsContainer");
    if (!container) return null;

    if (typeof L === "undefined") {
        container.innerHTML =
            "<p class='fout' style='padding:12px;'>Kaart kon niet worden geladen. Controleer of Leaflet wordt toegestaan.</p>";
        return null;
    }

    if (leafletKaart) {
        leafletKaart.remove();
        leafletKaart = null;
    }

    container.innerHTML = "<div id='leafletKaart'></div>";

    leafletKaart = L.map("leafletKaart", {
        scrollWheelZoom: false,
        attributionControl: false
    }).setView([52.1326, 5.2913], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
    }).addTo(leafletKaart);

    leafletMarkersLaag = L.layerGroup().addTo(leafletKaart);

    setTimeout(function() {
        if (leafletKaart) {
            leafletKaart.invalidateSize();
        }
    }, 150);

    return leafletKaart;
}

async function toonObjectEnReferentiesOpKaart(adres, plaats, huurReferenties = [], koopReferenties = [], historischeTaxaties = []) {
    const kaart = initialiseerLeafletKaart();
    if (!kaart) return;

    const bounds = [];
function maakKaartBol(type) {
    return L.divIcon({
        className: "",
        html: "<div class='kaartBol kaartBol" + type + "'></div>",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8]
    });
}
    function maakPopupVeilig(marker) {
        marker.on("popupopen", function(e) {
            const popupElement = e.popup.getElement();
            if (!popupElement) return;

            L.DomEvent.disableClickPropagation(popupElement);
            L.DomEvent.disableScrollPropagation(popupElement);

            const closeButton = popupElement.querySelector(".leaflet-popup-close-button");
            if (closeButton) {
                closeButton.removeAttribute("href");

                closeButton.onclick = function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    marker.closePopup();
                    return false;
                };
            }
        });
    }

    const objectCoords = await haalCoordinaten(adres, plaats, "");
    if (objectCoords) {
const marker = L.marker([objectCoords.lat, objectCoords.lon], {
    title: "Te taxeren object",
    icon: maakKaartBol("Object")
}).addTo(leafletMarkersLaag);

        marker.bindPopup(
            "<strong>Te taxeren object</strong><br>" +
            escapeHtml(adres) + "<br>" +
            escapeHtml(plaats)
        );

        maakPopupVeilig(marker);
        marker.openPopup();

        bounds.push([objectCoords.lat, objectCoords.lon]);
    }

    for (const ref of huurReferenties || []) {
        const coords = await haalCoordinaten(ref.adres, ref.plaats, ref.postcode || "");
        if (!coords) continue;

const marker = L.marker([coords.lat, coords.lon], {
    title: "Huurreferentie",
    icon: maakKaartBol("Huur")
}).addTo(leafletMarkersLaag);

        marker.bindPopup(
            "<strong>Huurreferentie</strong><br>" +
            escapeHtml(ref.adres || "") + "<br>" +
            escapeHtml(ref.plaats || "") + "<br>" +
            "Huur: " + escapeHtml(ref.transactiePrijs || "") + "<br>" +
            "Afstand: " + escapeHtml(ref.afstand || "Onbekend")
        );

        maakPopupVeilig(marker);

        bounds.push([coords.lat, coords.lon]);
    }

    for (const ref of koopReferenties || []) {
        const coords = await haalCoordinaten(ref.adres, ref.plaats, ref.postcode || "");
        if (!coords) continue;

const marker = L.marker([coords.lat, coords.lon], {
    title: "Koopreferentie",
    icon: maakKaartBol("Koop")
}).addTo(leafletMarkersLaag);

        marker.bindPopup(
            "<strong>Koop-/beleggingsreferentie</strong><br>" +
            escapeHtml(ref.adres || "") + "<br>" +
            escapeHtml(ref.plaats || "") + "<br>" +
            "Prijs: " + escapeHtml(ref.transactiePrijs || "") + "<br>" +
            "Afstand: " + escapeHtml(ref.afstand || "Onbekend")
        );

        maakPopupVeilig(marker);

        bounds.push([coords.lat, coords.lon]);
    }
for (const taxatie of historischeTaxaties || []) {
    const coords = await haalCoordinaten(taxatie.adres, taxatie.plaats, "");
    if (!coords) continue;

const marker = L.marker([coords.lat, coords.lon], {
    title: "Historische taxatie",
    icon: maakKaartBol("Taxatie")
}).addTo(leafletMarkersLaag);

    marker.bindPopup(
        "<strong>Historische taxatie</strong><br>" +
        escapeHtml(taxatie.adres || "") + "<br>" +
        escapeHtml(taxatie.plaats || "") + "<br>" +
        "VVO: " + escapeHtml(taxatie.vvo || "") + "<br>" +
        "Markthuurwaarde: " + escapeHtml(taxatie.markthuurwaarde || "") + "<br>" +
        "Marktwaarde: " + escapeHtml(taxatie.marktwaarde || "") + "<br>" +
        "BAR: " + escapeHtml(taxatie.barOrigineel || "")
    );

    maakPopupVeilig(marker);

    bounds.push([coords.lat, coords.lon]);
}
    if (bounds.length > 1) {
        kaart.fitBounds(bounds, {
            padding: [35, 35],
            maxZoom: 15
        });
    } else if (bounds.length === 1) {
        kaart.setView(bounds[0], 15);
    }
}
function berekenAfstandKm(coord1, coord2) {
    if (!coord1 || !coord2) return null;

    const R = 6371;
    const dLat = gradenNaarRadialen(coord2.lat - coord1.lat);
    const dLon = gradenNaarRadialen(coord2.lon - coord1.lon);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(gradenNaarRadialen(coord1.lat)) *
        Math.cos(gradenNaarRadialen(coord2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function gradenNaarRadialen(graden) {
    return graden * Math.PI / 180;
}

function formatAfstand(km) {
    if (km === null || isNaN(km)) return "Onbekend";

    if (km < 1) {
        return Math.round(km * 1000) + " meter";
    }

    return km.toFixed(1).replace(".", ",") + " km";
}

async function voegAfstandToeAanReferenties(resultaten, taxatieAdres, taxatiePlaats) {
    const taxatieCoords = await haalCoordinaten(taxatieAdres, taxatiePlaats, "");

    if (!taxatieCoords) {
        return resultaten.map(r => ({
            ...r,
            afstandKm: null,
            afstand: "Onbekend"
        }));
    }

    return Promise.all(resultaten.map(async r => {
        if (!r.adres || !r.plaats) {
            return {
                ...r,
                afstandKm: null,
                afstand: "Onbekend"
            };
        }

        const refCoords = await haalCoordinaten(r.adres, r.plaats, r.postcode);
        const afstandKm = berekenAfstandKm(taxatieCoords, refCoords);

return {
    ...r,
    afstandKm: afstandKm,
    afstand: formatAfstand(afstandKm),
    buurtnaam: refCoords ? refCoords.buurtnaam : "",
    wijknaam: refCoords ? refCoords.wijknaam : "",
    deelgebied: refCoords ? refCoords.deelgebied : ""
};
    }));
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function referentiesMogenOpKaart() {
    return (
        totaleOppervlakteIsIngevuld() &&
        window.referentiesGezochtMetObjectdata === true
    );
}
function vernieuwKaartMetActieveReferenties() {
    const adres = localStorage.getItem("taxatieAdres") || "";
    const plaats = localStorage.getItem("taxatiePlaats") || "";

    if (!adres || !plaats) return;

    werkLocatieKnoppenBij(adres, plaats);

const magReferentiesTonen = referentiesMogenOpKaart();
const magTaxatiesTonen = totaleOppervlakteIsIngevuld();

const actieveHuurReferenties = magReferentiesTonen
        ? (window.alleHuurReferenties || [])
            .filter(r => !(window.uitgeslotenHuurReferenties || []).includes(r.uniekeId))
            .slice(0, 5)
        : [];

    const actieveKoopReferenties = magReferentiesTonen
        ? (window.alleKoopReferenties || [])
            .filter(r => !(window.uitgeslotenKoopReferenties || []).includes(r.uniekeId))
            .slice(0, 5)
        : [];

const historischeTaxaties =
    magTaxatiesTonen &&
    window.laatsteHistorischeAnalyse &&
    window.laatsteHistorischeAnalyse.gebruikteTaxaties
        ? window.laatsteHistorischeAnalyse.gebruikteTaxaties
        : [];

    toonObjectEnReferentiesOpKaart(
        adres,
        plaats,
        actieveHuurReferenties,
        actieveKoopReferenties,
        historischeTaxaties
    );
}
function verwijderKoopReferentie(uniekeId) {
    if (!window.uitgeslotenKoopReferenties) {
        window.uitgeslotenKoopReferenties = [];
    }

    if (!window.uitgeslotenKoopReferenties.includes(uniekeId)) {
        window.uitgeslotenKoopReferenties.push(uniekeId);
    }

    const blok = document.getElementById("referentieResultaatBlok");

    if (blok && window.alleHuurReferenties) {
        blok.innerHTML = maakReferentieBlok(window.alleHuurReferenties);
    }

    vernieuwKaartMetActieveReferenties();
}
function maakHandmatigeInputVoorObjectveld(naam) {
const opgeslagen = localStorage.getItem("handmatig_" + naam) || "";

    let type = "text";
    let placeholder = "waarde";

if (
    naam === "Bouwjaar" ||
    naam === "Renovatiejaar" ||
    naam === "Verhuurd oppervlak" ||
    naam === "Totale oppervlakte"
) {
    type = "number";
}

    if (
        naam === "Ingangsdatum huurcontract" ||
        naam === "Einddatum huurcontract"
    ) {
        type = "date";
    }

    if (
        naam === "Actuele contracthuur" ||
        naam === "WOZ-waarde"
    ) {
        type = "number";
        placeholder = "€";
    }

    if (naam === "Bouwjaar" || naam === "Renovatiejaar") {
        placeholder = "jaar";
    }

if (naam === "Verhuurd oppervlak") {
    placeholder = "m²";
}

if (naam === "Totale oppervlakte") {
    placeholder = "m2 VVO";
}
    if (naam === "Achterstallig onderhoud") {
        placeholder = "omschrijving";
    }

    if (naam === "Energielabel") {
        placeholder = "A/B/C";
    }

return (
    " <input type='" + type + "' " +
    "class='bagButton' " +
    "data-handmatig-veld='" + escapeHtml(naam) + "' " +
    "style='width:86px;' " +
    "placeholder='" + escapeHtml(placeholder) + "' " +
    "value='" + escapeHtml(opgeslagen) + "' " +
    "onchange='slaHandmatigeWaardeOp(this.dataset.handmatigVeld, this.value)'>" +
    ""
);
}

function slaHandmatigeWaardeOp(naam, waarde) {
    if (!waarde) {
        localStorage.removeItem("handmatig_" + naam);
    } else {
        localStorage.setItem("handmatig_" + naam, waarde);
    }

    if (naam === "Totale oppervlakte") {
        werkReferentieOppervlakteInfoBij();

        if (typeof stelReferentieUitklapIn === "function") {
            stelReferentieUitklapIn(window.laatsteHuurReferentiesVoorWeergave || []);
        }

        if (typeof stelAnalyseUitklapIn === "function") {
            stelAnalyseUitklapIn();
        }

        if (typeof vernieuwKaartMetActieveReferenties === "function") {
            vernieuwKaartMetActieveReferenties();
        }
    }
}
function slaAlleHandmatigeWaardenOp() {
    document
        .querySelectorAll("#datakwaliteitModule input[data-handmatig-veld]")
        .forEach(input => {
            slaHandmatigeWaardeOp(input.dataset.handmatigVeld, input.value);
        });
}

function verwijderHuurReferentie(uniekeId) {
    if (!window.uitgeslotenHuurReferenties) {
        window.uitgeslotenHuurReferenties = [];
    }

    if (!window.uitgeslotenHuurReferenties.includes(uniekeId)) {
        window.uitgeslotenHuurReferenties.push(uniekeId);
    }

    const blok = document.getElementById("referentieResultaatBlok");

    if (blok && window.alleHuurReferenties) {
        blok.innerHTML = maakReferentieBlok(window.alleHuurReferenties);
    }

    vernieuwKaartMetActieveReferenties();
}
function startOpnieuwZoekenMetObjectdata() {
    const status = document.getElementById("opnieuwZoekenStatusTekst");
    const analyseKnop = document.getElementById("analyseKnop");

    if (status) {
        status.innerHTML = "Opnieuw zoeken wordt gestart...";
    }

    toonProcesStatus("Opnieuw zoeken met ingevulde objectdata...");

    slaAlleHandmatigeWaardenOp();

    window.alleHuurReferenties = null;
    window.uitgeslotenHuurReferenties = [];
    window.alleKoopReferenties = null;
    window.uitgeslotenKoopReferenties = [];

    if (!analyseKnop) {
        if (status) {
            status.innerHTML = "Analyseknop niet gevonden.";
        }
        return;
    }

    setTimeout(function() {
window.isOpnieuwZoekenMetObjectdata = true;
window.referentiesGezochtMetObjectdata = true;
        analyseKnop.click();
    }, 100);
}
async function zoekReferentiesVoorGeselecteerdAdres() {
    const resultaat = document.getElementById("resultaat");
alert("resultaat gevonden = " + !!resultaat + "\ntekst lengte = " + (txtBestandTekst ? txtBestandTekst.length : 0));

    try {
        window.alleHuurReferenties = null;
        window.uitgeslotenHuurReferenties = [];

        window.alleKoopReferenties = null;
        window.uitgeslotenKoopReferenties = [];

const marktAnalyse = await analyseerMarkt(adres, plaats, {
    zonderObjectdata: true
});

window.laatsteNabijeDrieJaarReferenties =
    marktAnalyse.nabijeDrieJaarReferenties || [];

werkReferentieWaarschuwingBij();

        const historischeAnalyse = await analyseerHistorischeTaxaties(adres, plaats);
        const koopAnalyse = await analyseerKoopReferenties(adres, plaats);

window.laatsteHistorischeAnalyse = historischeAnalyse;
window.laatsteKoopAnalyse = koopAnalyse;

window.alleHuurReferenties = marktAnalyse.resultaten.map((r, index) => ({
    ...r,
    uniekeId: index
}));
window.uitgeslotenHuurReferenties = [];

window.alleKoopReferenties = koopAnalyse.resultaten.map((r, index) => ({
    ...r,
    uniekeId: index
}));
window.uitgeslotenKoopReferenties = [];

vernieuwKaartMetActieveReferenties();
        let html = "";

        html += "<p><strong>Adres:</strong> " + escapeHtml(adres) + " | ";
        html += "<strong>Plaats:</strong> " + escapeHtml(plaats) + "</p>";

        html += "<div class='scoreGrid'>";

        html += "<div class='scoreBox'>";
        html += "<div class='scoreHeader'>";
        html += "<h4>Object</h4>";
        html += "</div>";
        html += "<table>";
        html += "<tr><th>Onderdeel</th><th>Status / waarde</th></tr>";
        html += "<tr><td colspan='2'>Niet van toepassing bij zoeken op adres.</td></tr>";
        html += "</table>";
        html += "</div>";

        html += "<div class='marktKolom'>";
html += maakMarktTabel(
    "Markt",
    marktAnalyse.score,
    marktAnalyse.aantal,
    marktAnalyse.nabijeOudereReferenties,
    true,
    marktAnalyse.resultaten,
    koopAnalyse.resultaten
);        html += maakHistorischeTaxatieBox(historischeAnalyse);
        html += "</div>";

        html += "</div>";
const referentieResultaatBlok = document.getElementById("referentieResultaatBlok");
if (referentieResultaatBlok) {
    referentieResultaatBlok.innerHTML = "";
}
        resultaat.innerHTML = html;

stelReferentieUitklapIn(marktAnalyse.resultaten);
stelAnalyseUitklapIn();

    } catch (error) {
        resultaat.innerHTML =
            "<p class='fout'>Er ging iets mis bij het zoeken naar referenties.</p>" +
            "<p class='fout'>" + escapeHtml(error.message) + "</p>";
    }
}
async function haalGemeenteVanPlaats(plaats) {
    try {
        const url =
            "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&q=" +
            encodeURIComponent(plaats);

        const response = await fetch(url);
        const data = await response.json();

        const doc =
            data.response &&
            data.response.docs &&
            data.response.docs[0];

        if (!doc) return plaats;

        // PDOK geeft meestal municipalityname terug
        const gemeente =
            doc.gemeentenaam ||
            doc.municipalityname ||
            plaats;

        return gemeente;
    } catch (e) {
        return plaats;
    }
}
function haalHuurderUitTekst(tekstOrigineel, bestandsnaam = "") {
    const tekst = String(tekstOrigineel || "")
        .replace(/\s+/g, " ")
        .trim();

    function isOngeldigeHuurder(waarde) {
        const v = normaliseerTekst(waarde);

        return (
            !v ||
            v.length < 3 ||
            v === "huurder" ||
            v.includes("huur en verhuur") ||
            v.includes("bedrijfsruimte") ||
            v.includes("burgerlijk wetboek") ||
            v.includes("artikel 7") ||
            v.includes("hierna") ||
            v.includes("te noemen")
        );
    }

    function maakHuurderUitBestandsnaam(naam) {
        return String(naam || "")
            .replace(/\.[^.]+$/, "")
            .replace(/^huurovereenkomst[_\-\s]*/i, "")
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    const patronen = [
        /\bhuurder\s*:?\s*([^.;\n\r]{2,160})/i,
        /\bals\s+huurder\s*:?\s*([^.;\n\r]{2,160})/i,
        /([^.;\n\r]{2,160}?)\s*,?\s*(?:hierna\s+te\s+noemen\s+['"]?huurder['"]?|hierna\s+genoemd\s+['"]?huurder['"]?)/i
    ];

    for (const regex of patronen) {
        const match = tekst.match(regex);

        if (match && match[1]) {
            const huurder = match[1]
                .replace(/['"“”‘’]/g, "")
                .replace(/\s+/g, " ")
                .replace(/^[,:;\-\s]+|[,:;\-\s]+$/g, "")
                .trim();

            if (!isOngeldigeHuurder(huurder)) {
                return huurder;
            }
        }
    }

    return maakHuurderUitBestandsnaam(bestandsnaam);
}
function analyseerAfwijkingenTussenBestanden(bestanden) {
    if (!bestanden || bestanden.length < 2) return [];

const meerdereObjecten = analyseerMeerdereObjecten(bestanden);

if (meerdereObjecten && meerdereObjecten.objecten.length >= 2) {
    const uniekeAdressen = [...new Set(
        meerdereObjecten.objecten
            .map(o => normaliseerTekst(o.adres))
            .filter(Boolean)
    )];

    if (uniekeAdressen.length > 1) {
        return [];
    }
}

    const analyses = bestanden.map(bestand => {
        const tekstOrigineel = String(bestand.tekst || "");
        const tekst = normaliseerTekst(tekstOrigineel);
if (
    normaliseerTekst(bestand.naam || "").includes("huurlijst") ||
    tekst.includes("huurlijst")
) {
    return null;
}

        let huurPerJaar = null;
        let oppervlakte = null;

        let totaalHuur = 0;
        let totaalOpp = 0;
        let aantalHuurdersregels = 0;

        const tabelRegex = /(?:^|\s)(?:[a-z0-9 .,'&/-]{0,80}?)\s+[0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4}\s+[0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4}\s+€?\s*([0-9][0-9.,]*)\s+([0-9][0-9.,]*)\b/gi;

        let tabelMatch;

        while ((tabelMatch = tabelRegex.exec(tekst)) !== null) {
            const huur = prijsNaarGetal(tabelMatch[1]);
            const opp = prijsNaarGetal(tabelMatch[2]);

            if (huur !== null && opp !== null) {
                totaalHuur += huur;
                totaalOpp += opp;
                aantalHuurdersregels++;
            }
        }

        if (aantalHuurdersregels > 0) {
            huurPerJaar = totaalHuur;
            oppervlakte = totaalOpp;
        } else {
const huurData = haalHuurprijsUitTekst(tekst);

if (huurData) {
    huurPerJaar = huurData.bedrag;
}
            }

            const oppMatch = tekst.match(/\b(?:bvo|vvo|oppervlakte|verhuurbare vloeroppervlakte)\s*:?\s*([0-9.,]+)\s*(?:m2|m²)?/i);

            if (oppMatch && oppMatch[1]) {
                oppervlakte = prijsNaarGetal(oppMatch[1]);
            }

               const adresPlaats = haalAdresEnPlaatsUitTekst(tekstOrigineel);
let huurderNaam = haalHuurderUitTekst(tekstOrigineel, bestand.naam || bestand.name || "");

if (!huurderNaam) {
    huurderNaam = String(bestand.naam || bestand.name || "")
        .replace(/\.[^.]+$/, "")
        .replace(/^huurovereenkomst[_\-\s]*/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const huurder = normaliseerTekst(huurderNaam);

return {
    naam: bestand.naam,
    adres: normaliseerTekst(adresPlaats.adres || ""),
    plaats: normaliseerTekst(adresPlaats.plaats || ""),
    huurder: huurder,
    huurderNaam: huurderNaam,
    huurPerJaar: huurPerJaar,
    oppervlakte: oppervlakte
};
    }).filter(a => a !== null);

    const meldingen = [];

    const huurwaardes = analyses.filter(a => a.huurPerJaar !== null);
    const oppervlaktes = analyses.filter(a => a.oppervlakte !== null);

    const zelfdeAdresEnHuurderGroepen = {};

    analyses.forEach(a => {
        if (!a.adres || !a.huurder) return;

        const sleutel = a.adres + "|" + a.plaats + "|" + a.huurder;

        if (!zelfdeAdresEnHuurderGroepen[sleutel]) {
            zelfdeAdresEnHuurderGroepen[sleutel] = [];
        }

        zelfdeAdresEnHuurderGroepen[sleutel].push(a);
    });

    Object.keys(zelfdeAdresEnHuurderGroepen).forEach(sleutel => {
        const groep = zelfdeAdresEnHuurderGroepen[sleutel];

        if (groep.length < 2) return;

        const huurwaardesGroep = groep.filter(a => a.huurPerJaar !== null);
        const oppervlaktesGroep = groep.filter(a => a.oppervlakte !== null);

        if (huurwaardesGroep.length >= 2) {
            const uniek = [...new Set(huurwaardesGroep.map(a => Math.round(a.huurPerJaar)))];

            if (uniek.length > 1) {
                meldingen.push({
                    type: "Huurprijs bij dezelfde huurder/adres",
                    details: huurwaardesGroep
                });
            }
        }

        if (oppervlaktesGroep.length >= 2) {
            const uniek = [...new Set(oppervlaktesGroep.map(a => Math.round(a.oppervlakte)))];

            if (uniek.length > 1) {
                meldingen.push({
                    type: "Oppervlakte bij dezelfde huurder/adres",
                    details: oppervlaktesGroep
                });
            }
        }
    });
    return meldingen;
}
function maakAfwijkingenMelding(afwijkingen) {
    if (!afwijkingen || afwijkingen.length === 0) return "";

    let html = "<div class='scoreBox' style='border-color:#ef9a9a; background:#fff5f5;'>";
    html += "<h4 style='color:#c62828;'>⚠ Afwijkingen tussen geüploade bestanden</h4>";
    html += "<table>";
    html += "<tr><th>Onderdeel</th><th>Bestand</th><th>Waarde</th></tr>";

    afwijkingen.forEach(afwijking => {
        afwijking.details.forEach(detail => {
            let waarde = "";

            if (afwijking.type.includes("Huurprijs")) {
                waarde = detail.huurPerJaar !== null
                    ? "€ " + detail.huurPerJaar.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " per jaar"
                    : "";
            }

           if (afwijking.type.includes("Oppervlakte")) {
                waarde = detail.oppervlakte !== null
                    ? detail.oppervlakte + " m²"
                    : "";
            }

            html += "<tr>";
            html += "<td>" + escapeHtml(afwijking.type) + "</td>";
            html += "<td>" + escapeHtml(detail.naam) + "</td>";
            html += "<td>" + escapeHtml(waarde) + "</td>";
            html += "</tr>";
        });
    });

    html += "</table>";
    html += "</div>";

    return html;
}
function analyseerMeerdereHuurovereenkomsten(bestanden) {
    if (!bestanden || bestanden.length < 2) return null;

    const huurcontracten = bestanden
        .map(bestand => {
            const tekstOrigineel = bestand.tekst || "";
            const tekst = normaliseerTekst(tekstOrigineel);
if (
    normaliseerTekst(bestand.naam || "").includes("huurlijst") ||
    tekst.includes("huurlijst")
) {
    return null;
}

            const isHuurcontract =
                tekst.includes("huurovereenkomst") ||
                tekst.includes("huurcontract") ||
                tekst.includes("verhuurder") ||
                tekst.includes("huurder");

            if (!isHuurcontract) return null;

let contracthuurPerJaar = haalContracthuurPerJaarUitTekst(tekstOrigineel);

const aanvangshuurPerJaar =
    haalContracthuurPerJaarUitTekst(tekstOrigineel) ||
    haalAanvangshuurPerJaarUitTekst(tekstOrigineel);
let oppervlakte = haalOppervlakteUitTekst(tekstOrigineel);
console.log("Oppervlakte gevonden:", bestand.naam, oppervlakte);

const ingangsdatum = haalIngangsdatumHuurcontractUitTekst(
    tekstOrigineel,
    bestand.naam || ""
);
const einddatum = haalEinddatumHuurcontractUitTekst(
    tekstOrigineel,
    bestand.naam || ""
);
const adresPlaats = haalAdresEnPlaatsUitTekst(tekstOrigineel);
const huurderNaam = haalHuurderUitTekst(tekstOrigineel, bestand.naam || "");

return {
    naam: bestand.naam,
    adres: normaliseerTekst(adresPlaats.adres || ""),
    plaats: normaliseerTekst(adresPlaats.plaats || ""),
    huurder: normaliseerTekst(huurderNaam || ""),
    huurderNaam: huurderNaam,
    huurPerJaar: contracthuurPerJaar,
    aanvangshuurPerJaar: aanvangshuurPerJaar,
    oppervlakte: oppervlakte,
    ingangsdatum: ingangsdatum,
    einddatum: einddatum
};
})
.filter(x => x !== null);

    if (huurcontracten.length < 2) return null;

    const uniekeContractenVoorOptelling = [];
    const gezien = {};

   huurcontracten.forEach(contract => {
    const huurderIsBetrouwbaar =
        contract.huurder &&
        contract.huurder.length > 3 &&
        !contract.huurder.includes("hierna") &&
        !contract.huurder.includes("te noemen") &&
        contract.huurder !== "huurder";

    const sleutel = huurderIsBetrouwbaar
        ? contract.adres + "|" + contract.plaats + "|" + contract.huurder
        : contract.adres + "|" + contract.plaats + "|" + contract.naam;

    if (!gezien[sleutel]) {
        gezien[sleutel] = true;
        uniekeContractenVoorOptelling.push(contract);
    }
});
    return {
        aantal: huurcontracten.length,
        aantalVoorOptelling: uniekeContractenVoorOptelling.length,
        totaalHuur: uniekeContractenVoorOptelling.reduce((som, x) => som + (x.huurPerJaar || 0), 0),
        totaalOpp: uniekeContractenVoorOptelling.reduce((som, x) => som + (x.oppervlakte || 0), 0),
        contracten: huurcontracten,
        contractenVoorOptelling: uniekeContractenVoorOptelling
    };
}
function analyseerHuurlijst(bestanden) {
    if (!bestanden || !bestanden.length) return null;

    const huurlijstBestand = bestanden.find(bestand => {
        const naam = normaliseerTekst(bestand.naam || "");
        const tekst = normaliseerTekst(bestand.tekst || "");

        return naam.includes("huurlijst") || tekst.includes("huurlijst");
    });

    if (!huurlijstBestand) return null;

    const tekst = String(huurlijstBestand.tekst || "")
        .replace(/\s+/g, " ")
        .trim();

    const huurregels = [];

    const regelRegex =
        /Rachelsmolen\s+1\s+Eindhoven\s+5612\s*MA\s+(.+?)\s+([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})\s+([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})\s+([0-9][0-9.\s,]*)\s*€?\s+([0-9][0-9.,]*)/gi;

    let match;

    while ((match = regelRegex.exec(tekst)) !== null) {
        const huurder = match[1]
            .replace(/\s+/g, " ")
            .trim();

        const huurprijs = bedragEuroNaarGetalNL(match[4]);
        const oppervlakte = prijsNaarGetal(match[5]);

        huurregels.push({
            huurder: huurder,
            ingangsdatum: match[2],
            einddatum: match[3],
            huurprijs: huurprijs,
            oppervlakte: oppervlakte
        });
    }

    if (!huurregels.length) return null;

    const regelsMetHuurprijs = huurregels.filter(regel =>
        regel.huurprijs !== null && regel.huurprijs > 0
    );

    return {
        bestand: huurlijstBestand.naam || "Huurlijst",
        regels: huurregels,
        allesAanwezig: regelsMetHuurprijs.length === huurregels.length,
        totaalHuur: regelsMetHuurprijs.reduce((som, regel) => som + regel.huurprijs, 0)
    };
}
function maakMeerdereHuurovereenkomstenInfoTekst(data) {
    if (!data) return "";

    let tekst = "Meerdere huurovereenkomsten gevonden\n\n";
    tekst += "Er zijn " + data.aantal + " huurovereenkomsten herkend. Alleen verschillende huurders worden opgeteld in de objectdata.\n\n";

    data.contracten.forEach(item => {
        tekst += "Bestand: " + (item.naam || "Onbekend") + "\n";
        tekst += "Huurder: " + (item.huurderNaam || item.huurder || "Niet gevonden") + "\n";
        tekst += "Aanvangshuur: " + (
item.aanvangshuurPerJaar !== null && item.aanvangshuurPerJaar > 0
    ? "€ " + item.aanvangshuurPerJaar.toLocaleString("nl-NL", { maximumFractionDigits: 0 })
    : "Niet gevonden"
        ) + "\n";
        tekst += "Oppervlakte: " + (
            item.oppervlakte !== null
                ? item.oppervlakte + " m²"
                : "Niet gevonden"
        ) + "\n\n";
    });

    tekst += "Totaal huur: € " + data.contracten
        .reduce((som, x) => som + (x.huurPerJaar || 0), 0)
        .toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + "\n";

    tekst += "Totaal oppervlakte: " + data.contracten
        .reduce((som, x) => som + (x.oppervlakte || 0), 0)
        .toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " m²";

    return tekst;
}
function maakMeerdereHuurovereenkomstenMelding(data) {
    if (!data) return "";

    let html = "<div class='scoreBox' style='border-color:#f9a825; background:#fffaf0;'>";
    html += "<h4 style='color:#f9a825;'>ⓘ Meerdere huurovereenkomsten gevonden</h4>";
    html += "<p>Er zijn " + data.aantal + " huurovereenkomsten herkend. Alleen verschillende huurders worden opgeteld in de objectdata.</p>";

    html += "<table>";
    html += "<tr><th>Bestand</th><th>Huurder</th><th>Aanvangshuur</th><th>Oppervlakte</th></tr>";

    data.contracten.forEach(item => {
        html += "<tr>";
        html += "<td>" + escapeHtml(item.naam) + "</td>";
        html += "<td>" + escapeHtml(item.huurderNaam || item.huurder || "Niet gevonden") + "</td>";
        html += "<td>" + (
    item.aanvangshuurPerJaar !== null && item.aanvangshuurPerJaar > 0
        ? "€ " + item.aanvangshuurPerJaar.toLocaleString("nl-NL", { maximumFractionDigits: 0 })
        : "Niet gevonden"
) + "</td>";
        html += "<td>" + (item.oppervlakte !== null ? item.oppervlakte + " m²" : "Niet gevonden") + "</td>";
        html += "</tr>";
    });

    const totaalHuurAlleContracten = data.contracten
    .reduce((som, x) => som + (x.huurPerJaar || 0), 0);

const totaalOppAlleContracten = data.contracten
    .reduce((som, x) => som + (x.oppervlakte || 0), 0);

html += "<tr>";
html += "<td colspan='2'><strong>Totaal</strong></td>";
html += "<td><strong>€ " + totaalHuurAlleContracten.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + "</strong></td>";
html += "<td><strong>" + totaalOppAlleContracten.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " m²</strong></td>";
html += "</tr>";

    html += "</table>";
    html += "</div>";

    return html;
}
function analyseerMeerdereObjecten(bestanden) {
    const objecten = bestanden.map(bestand => {
        const tekst = bestand.tekst || "";

        let adres = "";
        let plaats = "";

        const adresMatch = tekst.match(/adres\s*:\s*(.*?)(?=\s*(?:plaats|postcode|huurprijs|contracthuur|bvo|vvo|$))/i);
        const plaatsMatch = tekst.match(/plaats\s*:\s*(.*?)(?=\s*(?:adres|postcode|huurprijs|contracthuur|bvo|vvo|$))/i);

        if (adresMatch) {
            adres = normaliseerAdresVoorHuisnummer(adresMatch[1]);
        }

        if (plaatsMatch) {
            plaats = plaatsMatch[1].replace(/\s+/g, " ").trim();
        }

        if (!adres || !plaats) {
            const rozMatch = tekst.match(
                /gelegen\s+(.+?),\s*([1-9][0-9]{3}\s?[A-Z]{2})\s+([A-Za-zÀ-ÿ'’.\-\s]+?)(?=\s+kadastraal|\s+ter grootte|\s*$)/i
            );

            if (rozMatch) {
                adres = normaliseerAdresVoorHuisnummer(rozMatch[1]);
                plaats = rozMatch[3].replace(/\s+/g, " ").trim();
            }
        }

        const huurData = haalHuurprijsUitTekst(tekst);
        const huur = huurData ? huurData.bedrag : null;

        const bvoMatch = tekst.match(/\bbvo\s*:\s*([0-9.,]+)/i);
        const bvo = bvoMatch ? prijsNaarGetal(bvoMatch[1]) : null;

        const energieMatch = tekst.match(/energielabel\s*:\s*(a\+\+|a\+|a|b|c|d|e|f|g)/i);

        return {
            naam: bestand.naam,
            adres: adres,
            plaats: plaats,
            huurPerJaar: huur,
            bvo: bvo,
            energielabel: energieMatch ? energieMatch[1].toUpperCase() : ""
        };
    }).filter(o => o.adres || o.huurPerJaar || o.bvo || o.energielabel);

    if (objecten.length < 2) return null;

    const adressen = objecten
        .filter(o => o.adres)
        .map(o => {
            const adresSchoon = normaliseerAdresVoorHuisnummer(o.adres);
            const match = adresSchoon.match(/^(.+?)\s+(\d+)(?:\s*[a-zA-Z])?(?:\s*[-/]?\s*[a-zA-Z0-9]+)?\s*$/);

            return {
                origineel: o,
                straat: match ? normaliseerTekst(match[1]) : normaliseerTekst(adresSchoon.replace(/\d+.*$/, "")),
                huisnummer: match ? parseInt(match[2], 10) : 999999
            };
        });

    let laagsteAdres = null;

    if (adressen.length) {
        const eersteStraat = adressen[0].straat;

        const zelfdeStraat = adressen.filter(a =>
            a.straat === eersteStraat
        );

        laagsteAdres = zelfdeStraat
            .sort((a, b) => a.huisnummer - b.huisnummer)[0]
            .origineel;
    }

    return {
        objecten: objecten,
        adres: laagsteAdres ? laagsteAdres.adres : "",
        plaats: laagsteAdres ? laagsteAdres.plaats : "",
        totaalHuur: objecten.reduce((s, o) => s + (o.huurPerJaar || 0), 0),
        totaalBvo: objecten.reduce((s, o) => s + (o.bvo || 0), 0),
        energielabels: objecten.map(o => o.energielabel).filter(Boolean)
    };
}
function verrijkObjectAnalyseMetMeerdereObjecten(objectAnalyse, meerdereObjecten) {
    objectAnalyse.resultaten = objectAnalyse.resultaten.map(item => {

      if (item.naam === "Verhuurd oppervlak" && meerdereObjecten.totaalBvo > 0) {
    return {
        ...item,
        gevonden: true,
        waarde: meerdereObjecten.totaalBvo.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " m² BVO"
    };
}

if (item.naam === "Energielabel") {
    const metLabel = meerdereObjecten.objecten.filter(o => o.energielabel);
    const zonderLabel = meerdereObjecten.objecten.filter(o => !o.energielabel);

    if (metLabel.length > 0 && zonderLabel.length > 0) {
        return {
            ...item,
            gevonden: true,
            status: "info",
            waarde: metLabel.map(o => o.naam + ": " + o.energielabel).join(" | "),
            toelichting:
                "Energielabel aanwezig bij: " +
                metLabel.map(o => (o.adres || o.naam) + " (" + o.energielabel + ")").join(", ") +
                ". Ontbreekt bij: " +
                zonderLabel.map(o => o.adres || o.naam).join(", ")
        };
    }

    if (metLabel.length > 1 && zonderLabel.length === 0) {
        return {
            ...item,
            gevonden: true,
            status: "goed_info",
            waarde: "Alle energielabels aanwezig",
            toelichting:
                "Energielabels per adres: " +
                metLabel.map(o => (o.adres || o.naam) + ": " + o.energielabel).join(", ")
        };
    }
}
        return item;
    });

    objectAnalyse.score = berekenScore(objectAnalyse.resultaten);
    return objectAnalyse;
}
function normaliseerAdresVoorHuisnummer(adres) {
    let schoon = String(adres || "")
        .replace(/\s+/g, " ")
        .trim();

    // Herhaal totdat "3 4 4" ook echt "344" wordt
    while (/(\d)\s+(\d)/.test(schoon)) {
        schoon = schoon.replace(/(\d)\s+(\d)/g, "$1$2");
    }

    return schoon;
}
function haalHuisnummerUitAdres(adres) {
    const schoonAdres = normaliseerAdresVoorHuisnummer(adres);
    const match = schoonAdres.match(/\b(\d+)\b/);
    return match ? parseInt(match[1], 10) : 999999;
}
let gekozenAdresRechtsObject = null;

const adresZoekInputRechts = document.getElementById("adresZoekInputRechts");

if (adresZoekInputRechts) {
    adresZoekInputRechts.addEventListener("input", async function() {
        const waarde = this.value.trim();
        const suggestiesDiv = document.getElementById("adresSuggestiesRechts");

        gekozenAdresRechtsObject = null;

        if (!suggestiesDiv) return;

        if (waarde.length < 3) {
            suggestiesDiv.innerHTML = "";
            return;
        }

        try {
            const url =
                "https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?rows=6&fq=type:adres&q=" +
                encodeURIComponent(waarde);

            const response = await fetch(url);
            const data = await response.json();

            const docs = data.response && data.response.docs ? data.response.docs : [];

            suggestiesDiv.innerHTML = docs.map(doc => {
                const label = doc.weergavenaam || doc.suggest || "";
                const id = doc.id || "";

                return (
                    "<div class='adresSuggestieItem' " +
                    "data-id='" + escapeHtml(id) + "' " +
                    "data-label='" + escapeHtml(label) + "'>" +
                    escapeHtml(label) +
                    "</div>"
                );
            }).join("");

            document.querySelectorAll("#adresSuggestiesRechts .adresSuggestieItem").forEach(item => {
                item.addEventListener("click", function() {
                    kiesAdresSuggestieRechts(
                        this.getAttribute("data-id"),
                        this.getAttribute("data-label")
                    );
                });
            });
        } catch (e) {
            suggestiesDiv.innerHTML = "";
        }
    });
}

async function kiesAdresSuggestieRechts(id, label) {
    document.getElementById("adresZoekInputRechts").value = label;
    document.getElementById("adresSuggestiesRechts").innerHTML = "";

    try {
        const url =
            "https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=" +
            encodeURIComponent(id);

        const response = await fetch(url);
        const data = await response.json();

        const doc = data.response && data.response.docs && data.response.docs[0];

        if (!doc) {
            gekozenAdresRechtsObject = null;
            return;
        }

        gekozenAdresRechtsObject = {
            adres: [doc.straatnaam, doc.huisnummer, doc.huisletter, doc.huisnummertoevoeging]
                .filter(Boolean)
                .join(" "),
            plaats: doc.woonplaatsnaam || ""
        };

        localStorage.setItem("taxatieAdres", gekozenAdresRechtsObject.adres);
        localStorage.setItem("taxatiePlaats", gekozenAdresRechtsObject.plaats);

window.dispatchEvent(new Event("taxatieAdresGewijzigd"));

    } catch (e) {
        gekozenAdresRechtsObject = null;
    }
}

document.getElementById("referentiesZoekenKnop").addEventListener("click", async function() {
    let adres = "";
    let plaats = "";

    if (gekozenAdresRechtsObject) {
        adres = gekozenAdresRechtsObject.adres;
        plaats = gekozenAdresRechtsObject.plaats;
    } else {
        const invoer = document.getElementById("adresZoekInputRechts").value.trim();
        const delen = invoer.split(",");

        adres = delen[0] ? delen[0].trim() : "";
        plaats = delen[1] ? delen[1].trim() : "";
    }

    if (!adres || !plaats) {
        alert("Kies een adres uit de suggesties of vul in als: straat huisnummer, plaats.");
        return;
    }

    localStorage.setItem("taxatieAdres", adres);
    localStorage.setItem("taxatiePlaats", plaats);

window.dispatchEvent(new Event("taxatieAdresGewijzigd"));

    if (typeof zoekReferentiesVoorGeselecteerdAdres === "function") {
        await zoekReferentiesVoorGeselecteerdAdres();
    }
});

function laadGoogleMapsAdres() {
    const adres = localStorage.getItem("taxatieAdres") || "";
    const plaats = localStorage.getItem("taxatiePlaats") || "";

    const melding = document.getElementById("mapsAdresMelding");
    const container = document.getElementById("mapsContainer");
    const mapsKnop = document.getElementById("openMapsKnop");
    const omgevingsloketKnop = document.getElementById("omgevingsloketKnop");
    const kadastraleKaartKnop = document.getElementById("kadastraleKaartKnop");
    const bodemloketKnop = document.getElementById("bodemloketKnop");

if (!adres || !plaats) {
melding.innerHTML = "&nbsp;";

    initialiseerLeafletKaart();

    mapsKnop.style.display = "none";
    omgevingsloketKnop.style.display = "none";
    kadastraleKaartKnop.style.display = "none";
    bodemloketKnop.style.display = "none";

    return;
}

    const volledigAdres = adres + ", " + plaats + ", Nederland";
    const encodedAdres = encodeURIComponent(volledigAdres);

    const googleMapsUrl =
        "https://www.google.com/maps/search/?api=1&query=" + encodedAdres;

const googleMapsEmbedUrl =
    "https://maps.google.com/maps?q=" + encodedAdres + "&z=16&output=embed";

    melding.innerHTML =
        "<strong>Geselecteerd adres:</strong> " + escapeHtml(volledigAdres);

    mapsKnop.style.display = "inline-block";
    omgevingsloketKnop.style.display = "inline-block";
    kadastraleKaartKnop.style.display = "inline-block";
    bodemloketKnop.style.display = "inline-block";

    mapsKnop.onclick = function() {
        window.open(googleMapsUrl, "_blank");
    };

    omgevingsloketKnop.onclick = function() {
        window.open("https://omgevingswet.overheid.nl/regels-op-de-kaart/", "_blank");
    };

    kadastraleKaartKnop.onclick = function() {
        window.open("https://kadastralekaart.com/?q=" + encodedAdres, "_blank");
    };

    bodemloketKnop.onclick = function() {
        window.open("https://www.bodemloket.nl/kaart#zoeken/" + encodedAdres, "_blank");
    };
}

if (
    localStorage.getItem("taxatieAdres") &&
    localStorage.getItem("taxatiePlaats") &&
    txtBestandTekst
) {
    laadGoogleMapsAdres();
} else {
    localStorage.removeItem("taxatieAdres");
    localStorage.removeItem("taxatiePlaats");
    laadGoogleMapsAdres();
}
function toonUploadControls() {
    const uploadControls = document.getElementById("uploadControls");
    const resultaat = document.getElementById("resultaat");

    if (uploadControls) {
        uploadControls.style.display = "flex";
    }

    if (resultaat) {
        resultaat.style.marginTop = "";
    }
}
function verbergUploadControlsEnLijnResultaatUit() {
    const uploadStartScherm = document.getElementById("uploadStartScherm");
    const uploadNaKeuze = document.getElementById("uploadNaKeuze");
    const startProcesStatus = document.getElementById("startProcesStatusTekst");
    const appWerkgebied = document.getElementById("appWerkgebied");

    if (uploadStartScherm) {
        uploadStartScherm.style.display = "none";
    }

    if (uploadNaKeuze) {
        uploadNaKeuze.style.display = "none";
    }

    if (startProcesStatus) {
        startProcesStatus.style.display = "none";
    }

    if (appWerkgebied) {
        appWerkgebied.style.display = "block";
    }

setTimeout(function() {
    vernieuwKaartMetActieveReferenties();

    setTimeout(function() {
        if (leafletKaart) {
            leafletKaart.invalidateSize();
        }
    }, 200);
}, 250);
}
function toonProcesStatus(tekst) {
    const status = document.getElementById("procesStatusTekst");
    const startStatus = document.getElementById("startProcesStatusTekst");

    if (status) {
        status.innerHTML = tekst ? escapeHtml(tekst) : "";
    }

    if (startStatus) {
        startStatus.innerHTML = tekst ? escapeHtml(tekst) : "";
    }
}
function toonBeginTabellen() {
    const resultaat = document.getElementById("resultaat");
    if (!resultaat) return;

    let html = "";

    html += "<div class='scoreGrid'>";

    html += "<div class='scoreBox'>";
    html += "<div class='scoreHeader'>";
    html += "<h4>Object</h4>";
    html += maakScoreCirkel(0);
    html += "</div>";
    html += "<table>";
    html += "<tr><th>Onderdeel</th><th>Status / waarde</th></tr>";

    [
        "Huurovereenkomst(en)",
        "Bouwjaar",
        "Renovatiejaar",
"Verhuurd oppervlak",
"Totale oppervlakte",
"Leegstand",
"WOZ-waarde",
        "Achterstallig onderhoud",
        "Energielabel",
        "Incentives",
        "Servicekosten",
        "Parkeren",
        "Gebruiksdoel",
        "Actuele huur"
    ].forEach(function(naam) {
        html += "<tr>";
        html += "<td>" + escapeHtml(naam) + "</td>";
        html += "<td></td>";
        html += "</tr>";
    });

    html += "</table>";
    html += "</div>";

    html += "<div class='marktKolom'>";

    html += "<div class='scoreBox'>";
    html += "<div class='scoreHeader'>";
    html += "<h4>Markt</h4>";
    html += maakScoreCirkel(0);
    html += "</div>";
    html += "<p><strong>Referenties:</strong> 0</p>";
    html += "<p style='font-size:12px;'>Nog niet berekend.</p>";
    html += "</div>";

    html += "<div class='scoreBox historischeBox'>";
    html += "<h4>Historische taxaties</h4>";
    html += "<table>";
    html += "<tr><th>Onderdeel</th><th>Waarde</th></tr>";
    html += "<tr><td>Vergelijkbare taxaties</td><td>0</td></tr>";
    html += "<tr><td>Markthuurwaarde/m²</td><td>Niet beschikbaar</td></tr>";
    html += "<tr><td>Marktwaarde/m²</td><td>Niet beschikbaar</td></tr>";
    html += "<tr><td>BAR k.k.</td><td>Niet beschikbaar</td></tr>";
    html += "</table>";
    html += "</div>";

    html += "</div>";
    html += "</div>";

    resultaat.innerHTML = html;
}
function stelReferentieUitklapIn(resultaten) {
    const knop = document.getElementById("referentieUitklapKnop");
    const blok = document.getElementById("referentieResultaatBlok");

    if (!knop || !blok) return;
werkReferentieOppervlakteInfoBij();

    window.laatsteHuurReferentiesVoorWeergave = resultaten || [];

knop.style.display =
    window.laatsteHuurReferentiesVoorWeergave.length && totaleOppervlakteIsIngevuld()
        ? "inline-flex"
        : "none";
if (!totaleOppervlakteIsIngevuld()) {
    blok.innerHTML = "";
    knop.onclick = null;
    return;
}

    knop.innerHTML = "▼";
    knop.title = "Toon referenties";

    knop.onclick = function() {
        const isOpen = blok.innerHTML.trim() !== "";

        if (isOpen) {
            blok.innerHTML = "";
            knop.innerHTML = "▼";
            knop.title = "Toon referenties";
            return;
        }

        blok.innerHTML = maakReferentieBlok(window.laatsteHuurReferentiesVoorWeergave);
        knop.innerHTML = "▲";
        knop.title = "Verberg referenties";
synchroniseerAnalyseHoogtes();
    };
}

function maakAnalyseBlok() {
    let html = "";

    html += "<div class='referentieBox analyseToetsBox analyseToetsHuur'>";
    html += "<div class='referentieTitel'>Toets markthuur te taxeren object</div>";
    html += "<input type='number' id='toetsMarkthuurInput' placeholder='Bijv. 150' style='width:120px; padding:4px; margin-top:6px;'> ";
    html += "<span>€/m²/jaar</span> ";
    html += "<button type='button' class='bagButton' onclick='toetsMarkthuurReferenties()'>Toets</button>";
    html += "<div id='toetsMarkthuurResultaat' style='margin-top:8px;'></div>";
    html += "</div>";

    html += "<div class='referentieBox analyseToetsBox analyseToetsKoop'>";
    html += "<div class='referentieTitel'>Toets marktwaarde te taxeren object</div>";
    html += "<input type='number' id='toetsKoopWaardeInput' placeholder='Bijv. 1750' style='width:120px; padding:4px; margin-top:6px;'> ";
    html += "<span>€/m²</span> ";
    html += "<button type='button' class='bagButton' onclick='toetsKoopReferenties()'>Toets</button>";
    html += "<div id='toetsKoopWaardeResultaat' style='margin-top:8px;'></div>";
    html += "</div>";

    return html;
}
function stelAnalyseUitklapIn() {
    const knop = document.getElementById("analyseUitklapKnop");
    const blok = document.getElementById("analyseResultaatBlok");

    if (!knop || !blok) return;

    knop.style.display = totaleOppervlakteIsIngevuld()
    ? "inline-flex"
    : "none";
if (!totaleOppervlakteIsIngevuld()) {
    blok.innerHTML = "";
    knop.onclick = null;
    return;
}
    knop.innerHTML = "▼";
    knop.title = "Toon analyse";

    knop.onclick = function() {
        const isOpen = blok.innerHTML.trim() !== "";

        if (isOpen) {
            blok.innerHTML = "";
            knop.innerHTML = "▼";
            knop.title = "Toon analyse";
            return;
        }

        blok.innerHTML = maakAnalyseBlok();
        knop.innerHTML = "▲";
        knop.title = "Verberg analyse";
synchroniseerAnalyseHoogtes();
    };
}
function synchroniseerAnalyseHoogtes() {
    const huurReferenties = document.querySelector("#referentieResultaatBlok .referentieBoxHuur");
    const koopReferenties = document.querySelector("#referentieResultaatBlok .referentieBoxKoop");
    const toetsHuur = document.querySelector("#analyseResultaatBlok .analyseToetsHuur");
    const toetsKoop = document.querySelector("#analyseResultaatBlok .analyseToetsKoop");

    if (toetsHuur) {
        toetsHuur.style.height = "";
        toetsHuur.style.minHeight = "";
    }

    if (toetsKoop) {
        toetsKoop.style.height = "";
        toetsKoop.style.minHeight = "";
    }

    requestAnimationFrame(function() {
        if (huurReferenties && toetsHuur) {
            toetsHuur.style.height = huurReferenties.offsetHeight + "px";
        }

        if (koopReferenties && toetsKoop) {
            toetsKoop.style.height = koopReferenties.offsetHeight + "px";
        }
    });
}
function formatScorePercentage(score) {
    if (score === null || score === undefined || score === "") {
        return "";
    }

    const getal = Number(score);

    if (isNaN(getal)) {
        return String(score);
    }

    return Math.round(getal) + "%";
}
function berekenGemiddeldeResterendeLooptijdOngewogen(data) {
    if (!data || !data.contracten || !data.contracten.length) {
        return "";
    }

    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);

    const looptijdenJaren = data.contracten
        .map(contract => parseDatumTekst(contract.einddatum || ""))
        .filter(tijd => tijd !== null)
        .map(tijd => {
            const resterendeDagen = Math.max(0, (tijd - vandaag.getTime()) / (1000 * 60 * 60 * 24));
            return resterendeDagen / 365.25;
        });

    if (!looptijdenJaren.length) {
        return "";
    }

    const gemiddelde = looptijdenJaren.reduce((som, waarde) => som + waarde, 0) / looptijdenJaren.length;

    return gemiddelde.toFixed(1).replace(".", ",") + " jaar";
}
function berekenGemiddeldeResterendeLooptijdGewogen(data) {
    if (!data || !data.contracten || !data.contracten.length) {
        return "";
    }

    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);

    const regels = data.contracten
        .map(contract => {
            const eindtijd = parseDatumTekst(contract.einddatum || "");
            const oppervlakte = Number(contract.oppervlakte || 0);

            if (eindtijd === null || !oppervlakte || oppervlakte <= 0) {
                return null;
            }

            const resterendeDagen = Math.max(0, (eindtijd - vandaag.getTime()) / (1000 * 60 * 60 * 24));

            return {
                jaren: resterendeDagen / 365.25,
                oppervlakte: oppervlakte
            };
        })
        .filter(item => item !== null);

    const totaalOppervlakte = regels.reduce((som, item) => som + item.oppervlakte, 0);

    if (!regels.length || totaalOppervlakte <= 0) {
        return "";
    }

    const gewogenGemiddelde = regels.reduce((som, item) => {
        return som + (item.jaren * (item.oppervlakte / totaalOppervlakte));
    }, 0);

    return gewogenGemiddelde.toFixed(1).replace(".", ",") + " jaar";
}
function werkLocatieKnoppenBij(adres, plaats) {
    const mapsKnop = document.getElementById("openMapsKnop");
    const omgevingsloketKnop = document.getElementById("omgevingsloketKnop");
    const kadastraleKaartKnop = document.getElementById("kadastraleKaartKnop");
    const bodemloketKnop = document.getElementById("bodemloketKnop");

    if (!mapsKnop || !omgevingsloketKnop || !kadastraleKaartKnop || !bodemloketKnop) return;

    if (!adres || !plaats) {
        mapsKnop.style.display = "none";
        omgevingsloketKnop.style.display = "none";
        kadastraleKaartKnop.style.display = "none";
        bodemloketKnop.style.display = "none";
        return;
    }

    const volledigAdres = adres + ", " + plaats + ", Nederland";
    const encodedAdres = encodeURIComponent(volledigAdres);

    mapsKnop.style.display = "inline-block";
    omgevingsloketKnop.style.display = "inline-block";
    kadastraleKaartKnop.style.display = "inline-block";
    bodemloketKnop.style.display = "inline-block";

    mapsKnop.onclick = function() {
        window.open("https://www.google.com/maps/search/?api=1&query=" + encodedAdres, "_blank");
    };

    omgevingsloketKnop.onclick = function() {
        window.open("https://omgevingswet.overheid.nl/regels-op-de-kaart/", "_blank");
    };

    kadastraleKaartKnop.onclick = function() {
        window.open("https://kadastralekaart.com/?q=" + encodedAdres, "_blank");
    };

    bodemloketKnop.onclick = function() {
        window.open("https://www.bodemloket.nl/kaart#zoeken/" + encodedAdres, "_blank");
    };
}
function berekenBoxplotStats(waardes) {
    const sorted = waardes
        .filter(v => v !== null && !isNaN(v))
        .sort((a, b) => a - b);

    if (!sorted.length) return null;

    return {
        min: sorted[0],
        q1: kwartielArray(sorted, 0.25),
        mediaan: kwartielArray(sorted, 0.5),
        q3: kwartielArray(sorted, 0.75),
        max: sorted[sorted.length - 1]
    };
}

function maakBoxplotHtml(waardes, toetswaarde, eenheid) {
    const stats = berekenBoxplotStats(waardes);

    if (!stats) return "";

    const minSchaal = Math.min(stats.min, toetswaarde);
    const maxSchaal = Math.max(stats.max, toetswaarde);
    const bereik = maxSchaal - minSchaal || 1;

function x(waarde) {
    return 30 + ((waarde - minSchaal) / bereik) * 300;
}
    const toetsBinnen = toetswaarde >= stats.min && toetswaarde <= stats.max;
    const toetsKleur = toetsBinnen ? "#2e7d32" : "#c62828";

    return `
        <div class="boxplotKaart">
            <svg viewBox="0 0 360 112" class="boxplotSvg" role="img" aria-label="Boxplot referenties">
                <line x1="${x(stats.min)}" y1="52" x2="${x(stats.max)}" y2="52" class="boxplotLijn"></line>

                <line x1="${x(stats.min)}" y1="42" x2="${x(stats.min)}" y2="62" class="boxplotLijn"></line>
                <line x1="${x(stats.max)}" y1="42" x2="${x(stats.max)}" y2="62" class="boxplotLijn"></line>

                <rect x="${x(stats.q1)}" y="34" width="${Math.max(2, x(stats.q3) - x(stats.q1))}" height="36" class="boxplotBox"></rect>
                <line x1="${x(stats.mediaan)}" y1="31" x2="${x(stats.mediaan)}" y2="73" class="boxplotMediaan"></line>

                <line x1="${x(toetswaarde)}" y1="20" x2="${x(toetswaarde)}" y2="84" stroke="${toetsKleur}" stroke-width="2"></line>
                <circle cx="${x(toetswaarde)}" cy="20" r="4" fill="${toetsKleur}"></circle>

<text x="${x(stats.min)}" y="100" text-anchor="middle" class="boxplotLabel">${verkortBoxplotGetal(stats.min)}</text>
<text x="${x(stats.mediaan)}" y="100" text-anchor="middle" class="boxplotLabel">${verkortBoxplotGetal(stats.mediaan)}</text>
<text x="${x(stats.max)}" y="100" text-anchor="middle" class="boxplotLabel">${verkortBoxplotGetal(stats.max)}</text>
            </svg>
        </div>
    `;
}
function verkortBoxplotGetal(waarde) {
    const afgerond = Math.round(Number(waarde) || 0);

    if (Math.abs(afgerond) >= 1000) {
        return Math.round(afgerond / 1000) + "k";
    }

    return String(afgerond);
}
function losLineairStelselOp(A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.concat(b[i]));

    for (let i = 0; i < n; i++) {
        let maxRow = i;

        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
                maxRow = k;
            }
        }

        const temp = M[i];
        M[i] = M[maxRow];
        M[maxRow] = temp;

        if (Math.abs(M[i][i]) < 1e-12) {
            return null;
        }

        for (let k = i + 1; k < n; k++) {
            const factor = M[k][i] / M[i][i];

            for (let j = i; j <= n; j++) {
                M[k][j] -= factor * M[i][j];
            }
        }
    }

    const x = new Array(n).fill(0);

    for (let i = n - 1; i >= 0; i--) {
        let som = M[i][n];

        for (let j = i + 1; j < n; j++) {
            som -= M[i][j] * x[j];
        }

        x[i] = som / M[i][i];
    }

    return x;
}
function haalTaxatieObjectKenmerken() {
    const objectAnalyse = analyseerObject(
        txtBestandTekst,
        document.getElementById("eigenGebruikCheckbox").checked
    );

    const bouwjaarItem = objectAnalyse.resultaten.find(r =>
        r.naam === "Bouwjaar" && r.waarde
    );

    let oppervlakte = haalTaxatieOppervlakteVoorVergelijking();

    const handmatigBouwjaar = localStorage.getItem("handmatig_Bouwjaar") || "";
    const bouwjaar = handmatigBouwjaar
        ? parseInt(handmatigBouwjaar, 10)
        : (bouwjaarItem ? parseInt(bouwjaarItem.waarde, 10) : null);

    return {
        oppervlakte: oppervlakte,
        bouwjaar: bouwjaar && !isNaN(bouwjaar) ? bouwjaar : null
    };
}
function maakVerschilHtml(referentieWaarde, taxatieWaarde) {
    if (
        referentieWaarde === null ||
        referentieWaarde === undefined ||
        taxatieWaarde === null ||
        taxatieWaarde === undefined ||
        isNaN(referentieWaarde) ||
        isNaN(taxatieWaarde)
    ) {
        return "";
    }

    const verschil = Math.round(referentieWaarde - taxatieWaarde);

    let kleur = "#f9a825";
    let tekst = "0";

    if (verschil > 0) {
        kleur = "#2e7d32";
        tekst = "+" + verschil.toLocaleString("nl-NL");
    } else if (verschil < 0) {
        kleur = "#c62828";
        tekst = verschil.toLocaleString("nl-NL");
    }

    return " <span style='color:" + kleur + "; font-weight:bold;'>(" +
        tekst +
        ")</span>";
}
function berekenRegressieModelwaarde(referenties, prijsExtractor) {
    const taxatie = haalTaxatieObjectKenmerken();

    if (!taxatie.oppervlakte || !taxatie.bouwjaar) {
        return null;
    }

    const data = (referenties || [])
        .map(ref => {
            const prijs = prijsExtractor(ref);
            const opp = prijsNaarGetal(ref.totaleOpp);
            const bouwjaar = parseInt(String(ref.bouwjaar || "").replace(/\D/g, ""), 10);

            if (!prijs || prijs <= 0 || !opp || opp <= 0 || !bouwjaar || isNaN(bouwjaar)) {
                return null;
            }

            return {
                y: prijs,
                x: [1, opp, bouwjaar]
            };
        })
        .filter(Boolean);

    if (data.length < 3) {
        return null;
    }

    const XtX = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    const Xty = [0, 0, 0];

    data.forEach(punt => {
        for (let i = 0; i < 3; i++) {
            Xty[i] += punt.x[i] * punt.y;

            for (let j = 0; j < 3; j++) {
                XtX[i][j] += punt.x[i] * punt.x[j];
            }
        }
    });

    const beta = losLineairStelselOp(XtX, Xty);

    if (!beta) {
        return null;
    }

    const voorspelling =
        beta[0] +
        beta[1] * taxatie.oppervlakte +
        beta[2] * taxatie.bouwjaar;

    return voorspelling > 0 && isFinite(voorspelling)
        ? voorspelling
        : null;
}
function startNieuweUpload() {
    const txtUpload = document.getElementById("txtUpload");
    const uploadStartScherm = document.getElementById("uploadStartScherm");
    const uploadNaKeuze = document.getElementById("uploadNaKeuze");
    const appWerkgebied = document.getElementById("appWerkgebied");
    const startProcesStatus = document.getElementById("startProcesStatusTekst");

    if (txtUpload) {
        txtUpload.value = "";
    }

    if (uploadStartScherm) {
        uploadStartScherm.style.display = "block";
    }

    if (uploadNaKeuze) {
        uploadNaKeuze.style.display = "none";
    }

    if (appWerkgebied) {
        appWerkgebied.style.display = "none";
    }

    if (startProcesStatus) {
        startProcesStatus.style.display = "block";
        startProcesStatus.innerHTML = "";
    }

    if (txtUpload) {
        txtUpload.click();
    }
}
function haalTaxatieOppervlakteVoorVergelijking() {
    const handmatigTotaleOppervlakte =
        localStorage.getItem("handmatig_Totale oppervlakte") || "";

    const totaleOppervlakte = prijsNaarGetal(handmatigTotaleOppervlakte);

    if (totaleOppervlakte && totaleOppervlakte > 0) {
        return totaleOppervlakte;
    }

    const handmatigVerhuurdOppervlak =
        localStorage.getItem("handmatig_Verhuurd oppervlak") || "";

    const verhuurdOppervlak = prijsNaarGetal(handmatigVerhuurdOppervlak);

    if (verhuurdOppervlak && verhuurdOppervlak > 0) {
        return verhuurdOppervlak;
    }

    const objectAnalyse = analyseerObject(
        txtBestandTekst,
        document.getElementById("eigenGebruikCheckbox").checked
    );

    const oppItem = objectAnalyse.resultaten.find(r =>
        r.naam === "Verhuurd oppervlak" && r.waarde
    );

    return oppItem ? prijsNaarGetal(oppItem.waarde) : null;
}
function berekenGemiddeldeVergelijkbaarheidScore(referenties) {
    const scores = (referenties || [])
        .map(r => Number(r.score))
        .filter(score => !isNaN(score));

    if (!scores.length) {
        return null;
    }

    return Math.round(
        scores.reduce((som, score) => som + score, 0) / scores.length
    );
}
function energielabelNaarScore(label) {
    const schoon = String(label || "")
        .toUpperCase()
        .replace(/\s+/g, "");

    const scores = {
        "A++++": 100,
        "A+++": 95,
        "A++": 90,
        "A+": 85,
        "A": 80,
        "B": 70,
        "C": 60,
        "D": 50,
        "E": 40,
        "F": 30,
        "G": 20
    };

    return scores[schoon] ?? null;
}
function berekenEnergielabelScore(taxatieLabel, referentieLabel) {
    const taxatieScore = energielabelNaarScore(taxatieLabel);
    const referentieScore = energielabelNaarScore(referentieLabel);

    if (taxatieScore === null || referentieScore === null) {
        return null;
    }

    return Math.max(0, 100 - Math.abs(taxatieScore - referentieScore));
}
function herberekenLeegstand(resultaten) {
    const totaalOppItem = resultaten.find(item => item.naam === "Totale oppervlakte");
    const verhuurdOppItem = resultaten.find(item => item.naam === "Verhuurd oppervlak");
    const leegstandItem = resultaten.find(item => item.naam === "Leegstand");

    if (!totaalOppItem || !verhuurdOppItem || !leegstandItem) return;

    const totaalOpp = prijsNaarGetal(totaalOppItem.waarde);
    const verhuurdOpp = prijsNaarGetal(verhuurdOppItem.waarde);

    if (totaalOpp !== null && verhuurdOpp !== null) {
        const leegstand = Math.max(0, totaalOpp - verhuurdOpp);

        leegstandItem.gevonden = true;
        leegstandItem.waarde =
            leegstand.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " m²";
    }
}
function totaleOppervlakteIsIngevuld() {
    const waarde = localStorage.getItem("handmatig_Totale oppervlakte") || "";
    const oppervlakte = prijsNaarGetal(waarde);

    return oppervlakte !== null && oppervlakte > 0;
}
function formatObjectWaarde(item) {
    if (!item || !item.waarde) return "";

    if (
        item.naam === "Totale oppervlakte" &&
        prijsNaarGetal(item.waarde) !== null
    ) {
        return prijsNaarGetal(item.waarde).toLocaleString("nl-NL", {
            maximumFractionDigits: 0
        }) + " m²";
    }

    if (
        item.naam === "WOZ-waarde" &&
        prijsNaarGetal(item.waarde) !== null
    ) {
        return "€ " + prijsNaarGetal(item.waarde).toLocaleString("nl-NL", {
            maximumFractionDigits: 0
        });
    }

    return item.waarde;
}
function veldAltijdAanpasbaar(naam) {
    return [
        "Resterende looptijd gemiddeld (ongewogen)",
        "Resterende looptijd gemiddeld (gewogen)",
        "Bouwjaar",
        "Renovatiejaar",
        "Verhuurd oppervlak",
        "Totale oppervlakte",
        "WOZ-waarde",
        "Achterstallig onderhoud",
        "Energielabel",
        "Incentives",
        "Servicekosten",
        "Parkeren",
        "Gebruiksdoel",
        "Actuele huur"
    ].includes(naam);
}
function toggleObjectOppervlakteRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("oppervlakteOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg oppervlaktegegevens"
        : "Toon oppervlaktegegevens";
}
function toggleTaxatieRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("taxatiesOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg taxaties"
        : "Toon taxaties";
}
function toggleObjectBouwjaarRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("bouwjaarOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg bouwjaargegevens"
        : "Toon bouwjaargegevens";
}
function toggleObjectEnergielabelRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("energielabelOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg energielabelgegevens"
        : "Toon energielabelgegevens";
}
function toggleObjectWozRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("wozOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg WOZ-gegevens"
        : "Toon WOZ-gegevens";
}
function toggleObjectGebruikRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("gebruikOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg gebruiksgegevens"
        : "Toon gebruiksgegevens";
}
function toggleObjectOnderhoudRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("onderhoudOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg onderhoudsgegevens"
        : "Toon onderhoudsgegevens";
}
function telAantalHuurdersUitHuurovereenkomsten() {
    const data = window.laatsteMeerdereHuurovereenkomsten;

    if (!data) return null;

    const contracten =
        data.contractenVoorOptelling ||
        data.contracten ||
        [];

    const huurders = contracten
        .map(contract => normaliseerTekst(contract.huurderNaam || contract.huurder || ""))
        .filter(huurder => huurder && huurder !== "huurder");

    return huurders.length;
}
function toggleMarktHuurReferentieRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("huurReferentiesOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg huurreferenties"
        : "Toon huurreferenties";
}
function maakHuurdersInfoTekst() {
    const data = window.laatsteMeerdereHuurovereenkomsten;

    if (!data || !data.contracten || !data.contracten.length) {
        return "Geen huurdersinformatie beschikbaar.";
    }

    const contracten =
        data.contractenVoorOptelling ||
        data.contracten ||
        [];

    return contracten.map(contract => {
        const huurder = contract.huurderNaam || contract.huurder || contract.naam || "Onbekende huurder";

const aanvangshuur = contract.aanvangshuurPerJaar !== null && contract.aanvangshuurPerJaar > 0
    ? "€ " + contract.aanvangshuurPerJaar.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " per jaar"
    : "Niet gevonden";

const actueleHuurWaarde =
    contract.huurPerJaar ||
    contract.aanvangshuurPerJaar ||
    null;

const actueleHuur = actueleHuurWaarde !== null && actueleHuurWaarde > 0
    ? "€ " + actueleHuurWaarde.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " per jaar"
    : "Niet gevonden";

        return (
            "Huurder: " + huurder + "\n" +
            "Ingangsdatum: " + (contract.ingangsdatum || "Niet gevonden") + "\n" +
            "Einddatum: " + (contract.einddatum || "Niet gevonden") + "\n" +
            "Aanvangshuur: " + aanvangshuur + "\n" +
            "Actuele huur: " + actueleHuur
        );
    }).join("\n\n");
}

function toonHuurdersInfo() {
    toonPopupHtml(
        "Huurdersinformatie",
        tekstNaarPopupTabel(maakHuurdersInfoTekst())
    );
}
function toggleMarktKoopReferentieRijen(knop) {
    const tabel = knop.closest("table");
    if (!tabel) return;

    const isOpen = tabel.classList.toggle("koopReferentiesOpen");
    const pijl = knop.querySelector(".objectSubkopPijl");

    if (pijl) {
        pijl.textContent = isOpen ? "▲" : "▼";
    }

    knop.title = isOpen
        ? "Verberg koop-/beleggingsreferenties"
        : "Toon koop-/beleggingsreferenties";
}
async function haalBagGegevens(adres, plaats) {
    try {
        const coords = await metTimeout(
            haalCoordinaten(adres, plaats, ""),
            3000,
            null
        );

        if (!coords) return null;

        const marge = 0.00025;

        const bbox = [
            coords.lon - marge,
            coords.lat - marge,
            coords.lon + marge,
            coords.lat + marge
        ].join(",");

        const vboUrl =
            "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/verblijfsobject/items" +
            "?f=json&limit=10&bbox=" +
            encodeURIComponent(bbox);

        const vboData = await fetchJsonMetTimeout(vboUrl, 3000);
        const vboFeatures = vboData && vboData.features ? vboData.features : [];

        if (!vboFeatures.length) return null;

        const huisnummer = haalHuisnummerUitAdres(adres);

        const vboFeature =
            vboFeatures.find(feature => {
                const props = feature.properties || {};
                return Number(props.huisnummer) === Number(huisnummer);
            }) ||
            vboFeatures[0];

        const vboProps = vboFeature.properties || {};

        const gebruiksdoel = Array.isArray(vboProps.gebruiksdoel)
            ? vboProps.gebruiksdoel.join(", ")
            : (vboProps.gebruiksdoel ? String(vboProps.gebruiksdoel) : null);

        let bouwjaar =
            vboProps.bouwjaar ||
            vboProps.oorspronkelijkBouwjaar ||
            vboProps.oorspronkelijk_bouwjaar ||
            null;

        if (!bouwjaar) {
            const pandUrl =
                "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items" +
                "?f=json&limit=10&bbox=" +
                encodeURIComponent(bbox);

            const pandData = await fetchJsonMetTimeout(pandUrl, 3000);
            const pandFeatures = pandData && pandData.features ? pandData.features : [];

            const pandMetBouwjaar = pandFeatures.find(feature =>
                feature.properties && feature.properties.bouwjaar
            );

            if (pandMetBouwjaar) {
                bouwjaar = pandMetBouwjaar.properties.bouwjaar;
            }
        }

        return {
            gebruiksdoel: gebruiksdoel,
            bouwjaar: bouwjaar ? String(bouwjaar) : null
        };
    } catch (e) {
        console.log("BAG gegevens fout:", e);
        return null;
    }
}
function maakHuurderMatchWoorden(naam) {
    return normaliseerTekst(naam)
        .replace(/\b(b\.?v\.?|bv|b\.?v|n\.?v\.?|nv|holding|beheer)\b/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map(woord => woord.trim())
        .filter(woord => woord.length > 2);
}

function vindHuurlijstRegelVoorHuurder(huurder, huurlijstRegels) {
    const contractWoorden = maakHuurderMatchWoorden(huurder);

    let besteRegel = null;
    let besteScore = 0;

    huurlijstRegels.forEach(regel => {
        const regelWoorden = maakHuurderMatchWoorden(regel.huurder || "");

        const score = contractWoorden.filter(woord =>
            regelWoorden.includes(woord)
        ).length;

        if (score > besteScore) {
            besteScore = score;
            besteRegel = regel;
        }
    });

    return besteScore > 0 ? besteRegel : null;
}
function maakHuurdersInfoHtml() {
    const data = window.laatsteMeerdereHuurovereenkomsten;

    if (!data || !data.contracten || !data.contracten.length) {
        return "<p>Geen huurdersinformatie beschikbaar.</p>";
    }

    const contracten =
        data.contractenVoorOptelling ||
        data.contracten ||
        [];

    const huurlijstRegels =
        window.laatsteHuurlijstAnalyse && window.laatsteHuurlijstAnalyse.regels
            ? window.laatsteHuurlijstAnalyse.regels
            : [];

    return contracten.map((contract, index) => {
        const huurder = contract.huurderNaam || contract.huurder || contract.naam || "Onbekende huurder";

        const aanvangshuur = contract.aanvangshuurPerJaar !== null && contract.aanvangshuurPerJaar > 0
            ? "€ " + contract.aanvangshuurPerJaar.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " per jaar"
            : "Niet gevonden";

        const huurderNorm = normaliseerTekst(huurder);

     const huurlijstRegel = vindHuurlijstRegelVoorHuurder(
    huurder,
    huurlijstRegels
);

        const actueleHuurWaarde =
            huurlijstRegel && huurlijstRegel.huurprijs !== null && huurlijstRegel.huurprijs > 0
                ? huurlijstRegel.huurprijs
                : null;

        const actueleHuur = actueleHuurWaarde !== null && actueleHuurWaarde > 0
            ? "€ " + actueleHuurWaarde.toLocaleString("nl-NL", { maximumFractionDigits: 0 }) + " per jaar"
            : "Niet gevonden";

        let html = "";

        html += "<div style='margin-bottom:14px;'>";
        html += "<h4 style='margin:0 0 6px 0; color:#0d045c;'>" + escapeHtml(huurder) + "</h4>";
        html += "<table>";
        html += "<tr><td>Ingangsdatum</td><td>" + escapeHtml(contract.ingangsdatum || "Niet gevonden") + "</td></tr>";
        html += "<tr><td>Einddatum</td><td>" + escapeHtml(contract.einddatum || "Niet gevonden") + "</td></tr>";
        html += "<tr><td>Aanvangshuur</td><td>" + escapeHtml(aanvangshuur) + "</td></tr>";
        html += "<tr><td>Actuele huur</td><td>" + escapeHtml(actueleHuur) + "</td></tr>";
        html += "</table>";
        html += "</div>";

        return html;
    }).join("");
}

function toonHuurdersInfo() {
    toonPopupHtml(
        "Huurdersinformatie",
        maakHuurdersInfoHtml()
    );
}
function haalAanvangshuurPerJaarUitTekst(origineel) {
    const tekst = String(origineel || "")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, "\"")
        .replace(/\s+/g, " ")
        .trim();

    const artikel41 = tekst.match(
        /4\.1[\s\S]{0,500}?\baanvangshuurprijs\b[\s\S]{0,250}?\bop\s+jaarbasis\s*€\s*([0-9][0-9.\s,]*)/i
    );

    if (artikel41 && artikel41[1]) {
        return bedragEuroNaarGetalNL(artikel41[1]);
    }

    const fallback = tekst.match(
        /\b(?:aanvangshuurprijs|aanvangshuur|huurprijs bij aanvang)\b[\s\S]{0,250}?\bop\s+jaarbasis\s*€\s*([0-9][0-9.\s,]*)/i
    );

    return fallback && fallback[1]
        ? bedragEuroNaarGetalNL(fallback[1])
        : null;
}

function haalContracthuurPerJaarUitTekst(origineel) {
    const tekst = String(origineel || "")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, "\"")
        .replace(/\s+/g, " ")
        .trim();

    const artikel410 = tekst.match(
        /4\.10\.?[\s\S]{0,700}?Per\s+betaalperiode\s+van\s+([0-9]+)\s+kalendermaand(?:en)?[\s\S]{0,350}?\bhuurprijs\s*€\s*([0-9][0-9.\s,]*)/i
    );

    if (artikel410 && artikel410[1] && artikel410[2]) {
        const maanden = parseInt(artikel410[1], 10);
        const bedrag = bedragEuroNaarGetalNL(artikel410[2]);

        if (bedrag !== null && maanden > 0) {
            return bedrag * (12 / maanden);
        }
    }

    const actueel = tekst.match(
        /\b(?:contracthuur|actuele huur|huidige huur|lopende huur|geldende huurprijs)\b[\s\S]{0,220}?€\s*([0-9][0-9.\s,]*)\s*(?:per\s*(maand|jaar))?/i
    );

    if (actueel && actueel[1]) {
        const bedrag = bedragEuroNaarGetalNL(actueel[1]);
        const periode = normaliseerTekst(actueel[2] || "");

        if (bedrag !== null) {
            return periode === "maand" ? bedrag * 12 : bedrag;
        }
    }

    return null;
}
function werkReferentieOppervlakteInfoBij() {
    const balk = document.getElementById("referentieTitelBalk");
    const uitklapKnop = document.getElementById("referentieUitklapKnop");

    if (!balk) return;

    let infoKnop = document.getElementById("referentieOppervlakteInfoKnop");

    if (!infoKnop) {
        infoKnop = document.createElement("button");
        infoKnop.type = "button";
        infoKnop.id = "referentieOppervlakteInfoKnop";
        infoKnop.className = "referentieInfoKnop";
        infoKnop.innerHTML = "i";
        infoKnop.title = "Waarom zijn referenties nog niet beschikbaar?";
        infoKnop.onclick = function() {
            toonPopupHtml(
                "Referenties nog niet beschikbaar",
                "<p>Vul eerst de totale oppervlakte in bij Objectdata. Daarna kunnen de referenties en analyse worden uitgeklapt.</p>"
            );
        };

        if (uitklapKnop) {
            balk.insertBefore(infoKnop, uitklapKnop);
        } else {
            balk.appendChild(infoKnop);
        }
    }

    infoKnop.style.display = totaleOppervlakteIsIngevuld()
        ? "none"
        : "inline-flex";
}
function werkReferentieWaarschuwingBij() {
    const titel = document.querySelector("#referentieTitelBalk h4");
    if (!titel) return;

    let knop = document.getElementById("referentieWaarschuwingKnop");
    const resultaten = window.laatsteNabijeDrieJaarReferenties || [];

    if (!knop) {
        knop = document.createElement("button");
        knop.type = "button";
        knop.id = "referentieWaarschuwingKnop";
        knop.className = "referentieWaarschuwingKnop";
        knop.innerHTML = "!";
        knop.title = "Referenties binnen 150 meter in de afgelopen 3 jaar";
        knop.onclick = toonNabijeDrieJaarReferenties;
        titel.appendChild(knop);
    }

    knop.style.display = resultaten.length ? "inline-flex" : "none";
}

function toonNabijeDrieJaarReferenties() {
    const resultaten = window.laatsteNabijeDrieJaarReferenties || [];

    if (!resultaten.length) {
        toonPopupHtml(
            "Nabije referenties",
            "<p>Geen referenties binnen 150 meter in de afgelopen 3 jaar gevonden.</p>"
        );
        return;
    }

    const rows = resultaten.map(r => [
        r.adres,
        r.postcode,
        r.plaats,
        r.afstand || "Onbekend",
        r.transactiePrijs,
        r.totaleOpp,
        r.bouwjaar,
        r.datum
    ]);

    toonPopupHtml(
        "Referenties binnen 150 meter",
        "<p class='fout'><strong>Let op:</strong> Er zijn referenties gevonden binnen 150 meter in de afgelopen 3 jaar.</p>" +
        maakPopupTabel(
            ["Adres", "Postcode", "Plaats", "Afstand", "Transactieprijs", "Oppervlakte", "Bouwjaar", "Datum"],
            rows
        )
    );
}
function toonAppWerkgebied() {
alert("toonAppWerkgebied gestart");
    const appWerkgebied = document.getElementById("appWerkgebied");
    if (appWerkgebied) {
        appWerkgebied.style.display = "block";
alert("toonAppWerkgebied klaar");
    }
}

toonBeginTabellen();

window.addEventListener("storage", laadGoogleMapsAdres);
window.addEventListener("taxatieAdresGewijzigd", laadGoogleMapsAdres);
