import axios from "axios";

const TALKAI_COOKIE = "_csrf-front=340cdb4d246dce9342e71ccdc7e5dff19e7237811de179b8bf1524b01a8816bfa%3A2%3A%7Bi%3A0%3Bs%3A11%3A%22_csrf-front%22%3Bi%3A1%3Bs%3A32%3A%22qh2SQsQuXBkwpsOgQ1BRf3ozDcnPBr2a%22%3B%7D; _clck=1xvj20m%5E2%5Efzs%5E0%5E2100; _ym_uid=1759358181310738339; _ym_d=1759358181; __gads=ID=e3767037bb6f55f4:T=1759358179:RT=1759358179:S=ALNI_MZeTkvDl1ExfBwKCDZuBOnDlflXJQ; __gpi=UID=000011754b4859cf:T=1759358179:RT=1759358179:S=ALNI_MbO6rHCCrGxNFWVWck89hvuhxa4AA; __eoi=ID=0472f7d15db2ddb5:T=1759358179:RT=1759358179:S=AA-AfjZb_WV5rHzrpthZUU9nuVj0; _ym_isad=2; _ym_visorc=b; _clsk=1dh881i%5E1759358192953%5E2%5E1%5Ef.clarity.ms%2Fcollect; FCNEC=%5B%5B%22AKsRol-D1aKLSrhU1ZVKbZvqKDN8eG2ngV3K1ol6CYBJFpOSA2gIMDQnYjgvCgQALgmVv7ljfSJ616sridwhPQDdgx4nrmQTGvQDWzltCkzBftReMBDDBvnLS3jlmiP06ZmTSyRvuYtYq8vJNBSUUopiW6r_I3u_uA%3D%3D%22%5D%5D";

const DEFAULT_HEADERS = {
  authority: "talkai.info",
  accept: "application/json, text/event-stream",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "content-type": "application/json",
  cookie: TALKAI_COOKIE,
  origin: "https://talkai.info",
  referer: "https://talkai.info/chat/",
  "sec-ch-ua": `"Chromium";v="137", "Not/A)Brand";v="24"`,
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": `"Android"`,
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
};

function convertMessagesToTalkai(messages = []) {
  return messages.map((m, idx) => {
    const id = m.id || `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`;
    const from = m.role === "user" ? "you" : "assistant";
    return { id, from, content: m.content ?? "" };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }

  try {
    const { model = "gpt-5-nano", temperature = 0.7, messages = [], stream } = req.body;

    const talkaiBody = {
      type: "chat",
      messagesHistory: convertMessagesToTalkai(messages),
      settings: {
        model,
        temperature,
      },
    };

    const talkaiResponse = await axios({
      method: "post",
      url: "https://talkai.info/chat/send/",
      data: talkaiBody,
      responseType: "stream",
      headers: DEFAULT_HEADERS,
      timeout: 120000,
    });

    const contentType = talkaiResponse.headers["content-type"] || "";

    if (contentType.includes("text/event-stream") || stream === true) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      talkaiResponse.data.on("data", (chunk) => {
        res.write(chunk);
      });

      talkaiResponse.data.on("end", () => {
        res.write("\n\n");
        res.end();
      });

      talkaiResponse.data.on("error", (err) => {
        console.error("Erro no stream do talkai:", err.message || err);
        try { res.end(); } catch (e) {}
      });

      return;
    } else {
      const chunks = [];
      for await (const chunk of talkaiResponse.data) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      let talkaiJson;
      try {
        talkaiJson = JSON.parse(raw);
      } catch (e) {
        return res.json({
          id: "chatcmpl-" + Date.now(),
          object: "chat.completion",
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: raw },
              finish_reason: "stop",
            },
          ],
        });
      }

      const replyText =
        (talkaiJson && (talkaiJson.reply || talkaiJson.content || talkaiJson.message)) ||
        JSON.stringify(talkaiJson);

      return res.json({
        id: "chatcmpl-" + Date.now(),
        object: "chat.completion",
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: replyText },
            finish_reason: "stop",
          },
        ],
      });
    }
  } catch (err) {
    console.error("Erro no proxy para talkai:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "Erro interno ao processar a requisição." });
  }
}
