// netlify/functions/keyrate.js
// SOAP POST к ЦБ + парсинг <keyRate ...>VALUE</keyRate>
const https = require("https");

exports.handler = async function () {
  try {
    const xml = await soapCall(
      "https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx",
      "http://web.cbr.ru/MainInfoXML",
      `<MainInfoXML xmlns="http://web.cbr.ru/" />`
    );

    // 1) значение ставки: допускаем атрибуты у тега
    const rateMatch = xml.match(/<keyRate\b[^>]*>([\d.,]+)<\/keyRate>/i);
    // 2) дата — из атрибута Date у keyRate (если есть)
    const dateAttrMatch = xml.match(/<keyRate\b[^>]*\bDate="([^"]+)"/i);
    // запасные варианты (если вдруг структура изменится)
    const dateTagMatch =
      xml.match(/<keyRate_dt>\s*([^<]+)\s*<\/keyRate_dt>/i) ||
      xml.match(/<OnDate>\s*([^<]+)\s*<\/OnDate>/i);

    if (!rateMatch) {
      return json(502, {
        error: "KeyRate not found in CBR XML",
        sample: xml.slice(0, 600),
      });
    }

    const rate = Number(rateMatch[1].replace(",", "."));
    const date = (dateAttrMatch ? dateAttrMatch[1] : (dateTagMatch ? dateTagMatch[1] : null));

    return json(200, { rate, date, source: "CBR MainInfoXML (SOAP)" });
  } catch (e) {
    return json(502, { error: String(e) });
  }
};

function soapCall(url, soapAction, innerXml) {
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>${innerXml}</soap:Body></soap:Envelope>`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": `"${soapAction}"`,
          "User-Agent": "Mozilla/5.0 (Netlify Function)",
          "Connection": "close",
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`CBR HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timeout")));
    req.write(envelope);
    req.end();
  });
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(obj),
  };
}
