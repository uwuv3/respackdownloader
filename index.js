//process.env.DEBUG = ["minecraft-protocol"]
//process.env.DEBUG = "bindings";
const bedrock = require("bedrock-protocol");
const Options = require("bedrock-protocol/src/options");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const crypto = require("crypto");
const gofile = require("./gofileupload.js");
const ProgressBar = require("progress");
const auth = require("bedrock-protocol/src/client/auth");

const { Readable } = require("stream");
const { default: axios } = require("axios");
const { Authflow, Titles } = require("prismarine-auth");
const { RealmAPI } = require("prismarine-realms");

function askQuestion(questions) {
  console.clear();
  const question = [
    {
      type: "list",
      name: "choice",
      message: "Bir seçenek belirleyin:",
      choices: questions,
    },
  ];
  return new Promise(async (resolve) => {
    (await import("inquirer")).default.prompt(question).then((res) => {
      resolve(res.choice);
    });
  });
}

function trueFalse(text) {
  console.clear();
  const soru = [
    {
      type: "confirm",
      name: "onay",
      message: text,
      default: false,
    },
  ];
  return new Promise(async (resolve) => {
    (await import("inquirer")).default.prompt(soru).then((res) => {
      resolve(res.onay);
    });
  });
}

function getResult(question, txt) {
  console.clear();
  if (txt) console.log(txt);
  if (!Array.isArray(question)) {
    if (!question.message.endsWith(": ")) question.message += ": ";
    if (!question.name) question.name = "answer";
    question = [question];
  }
  return new Promise(async (resolve) => {
    (await import("inquirer")).default.prompt(question).then((res) => {
      resolve(res.answer);
    });
  });
}
let profilesFolder = path.join(__dirname, "profiles");
trueFalse("Realms sunucusu mu?").then(async (res) => {
  if (res) {
    const auth = new Authflow(
      undefined,
      profilesFolder,
      {
        authTitle: Titles.MinecraftNintendoSwitch,
        deviceType: "Nintendo",
        flow: "live",
      }
    );
    const api = RealmAPI.from(auth, "bedrock");
    const realms = (await api.getRealms()) || [];
    const listMap = realms.map((x) => {
      return { name: x.name, value: x.id };
    });
    askQuestion(listMap).then((x) => {
      cc(true, x);
    });
  } else {
    getResult({
      type: "input",
      message: "Sunucu Ip nedir?",
    }).then((res) => {
      let server_ip = res;
      getResult({
        type: "input",
        message: "Sunucu Port nedir?",
        default: "19132",
        validate: (token) => {
          return !isNaN(Number(token));
        },
      }).then((ress) => {
        let server_port = Number(ress);
        cc(false, server_ip, server_port);
      });
    });
  }
});
function cc(realm, ip, port) {
  let server_ip = ip;
  let options = {
    offline: false,
    viewDistance: 1,
  };
  if (realm) {
    options.realms = {};
    options.realms.pickRealm = (realms) => realms.find((e) => e.id === ip);
  } else {
    options.host = ip;
    options.port = port;
  }

  const client = createClient(options);
  let uids = [];
  let packs = [];
  let download = false;
  let saved_files = [];
  let currentID = undefined;
  client.on("resource_packs_info", async (json) => {
    console.log(json);
    packs = json.texture_packs.map((x) => {
      x.text = x.uuid + "_" + x.version;
      return x;
    });
    if (!json.resource_pack_links.length) {
      const uuids = json.texture_packs.map((x) => x.uuid + "_" + x.version);

      uids = uuids;
      currentID = uids.pop();
      client.write("resource_pack_client_response", {
        response_status: "send_packs",
        resourcepackids: [currentID],
      });
    } else {
      let totalLength = 0;
      let downloadedLength = 0;

      const progressBar = new ProgressBar("Downloading [:bar] :percent :etas", {
        total: 100, // Total progress bar length (in percent)
        width: 40, // Width of the progress bar
        complete: "=",
        incomplete: " ",
        renderThrottle: 100, // Update the progress bar every 100ms
      });
      const links = json.resource_pack_links.map(async (x) => {
        return new Promise(async (a) => {
          const data = await axios({
            url: x.url,
            method: "GET",
            responseType: "stream",
          });
          let chunks = [];
          totalLength = totalLength + data.headers["content-length"];
          // Handle data streaming
          data.data.on("data", (chunk) => {
            downloadedLength += chunk.length;
            chunks.push(chunk);
            const percent = Math.round((downloadedLength / totalLength) * 100);
            progressBar.update(percent / 100);
          });

          data.data.on("end", (y) => {
            try {
              const buffer = Buffer.concat(chunks);
              savePayloadToZip(x.id, buffer);
              a();
            } catch (error) {
              console.log(error);
            }
          });
        });
      });
      await Promise.all(links);
      client.close();
    }
  });
  const compressFolder = (zipEntries, folderName) => {
    const folderZip = new AdmZip();

    const folderEntries = zipEntries.filter(
      (entry) =>
        entry.entryName.startsWith(folderName) && entry.entryName !== folderName
    );
    const hasContentsJson = folderEntries.some(
      (entry) => path.basename(entry.entryName) === "contents.json"
    );

    if (!hasContentsJson) {
      return null;
    }
    folderEntries.forEach((entry) => {
      const relativePath = entry.entryName.replace(folderName, "");
      folderZip.addFile(relativePath, entry.getData());
    });

    return folderZip.toBuffer();
  };
  function extractUUID(pack_id) {
    // Regular expression to match UUID v4 format
    const uuidRegex =
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

    const match = pack_id.match(uuidRegex);
    return match ? match[0] : null;
  }
  let payloads = [];
  function savePayloadToZip(pack_id, payloadBuffer) {
    payloads.push(
      new Promise(async (resolve, reject) => {
        if (download) {
          const zipDir = "./downloads";
          const zipFilename = `${pack_id}.zip`;
          const zipPath = path.join(zipDir, zipFilename);

          if (!fs.existsSync(zipDir)) {
            fs.mkdirSync(zipDir, { recursive: true });
          }

          const fileStream = fs.createWriteStream(zipPath);

          fileStream.on("error", (err) => reject(err));
          fileStream.on("finish", () => {
            saved_files.push(zipFilename);
            console.log(`Payload ${zipFilename} içerisine kaydedildi.`);
          });

          fileStream.write(payloadBuffer);
          fileStream.end();
        }
        const zip = new AdmZip(payloadBuffer);
        const zipEntries = zip.getEntries();
        zipEntries.forEach((entry) => {
          if (entry.entryName.endsWith(".zip")) {
            if (!entry.isDirectory) {
              const content = entry.getData();
              savePayloadToZip(
                `${pack_id}}${entry.entryName}`,
                //          .replace(".zip", "")
                //           .replace(/\//, "_")}`,
                content
              );
            }
          }
          if (entry.isDirectory) {
            const folderBuffer = compressFolder(zipEntries, entry.entryName);
            if (folderBuffer)
              savePayloadToZip(
                `${pack_id}}${entry.entryName}`,
                //   .replace(".zip", "")
                //      .replace(/\//, "_")}`,
                folderBuffer
              );
          }
        });

        try {
          const uuid =
            extractUUID(pack_id) ?? pack_id.replace(".zip", "").split("}")[0];
          let key = packs.find(
            (x) => x.text == uuid || x.uuid == uuid
          ).content_key;
          let content;
          const contentEntry = zipEntries.find(
            (entry) => entry.entryName == "contents.json"
          );
          const keyBuffer = Buffer.from(key);
          const iv = keyBuffer.slice(0, 16);
          if (contentEntry) {
            const contentBody = contentEntry?.getData().slice(0x100);
            const decryptedContent = Buffer.from(
              crypto
                .createDecipheriv("aes-256-cfb8", keyBuffer, iv)
                .update(contentBody)
            ).toString();

            content = JSON.parse(decryptedContent);
          }
          if (key && content) {
            const newZip = new AdmZip();
            const uniqueContent = Array.from(
              new Map(content.content.map((item) => [item.path, item])).values()
            );
            newZip.addFile(
              "manifest.json",
              zipEntries.find((e) => e.entryName == "manifest.json")?.getData()
            );
            for (const entry of uniqueContent) {
              const inputEntry = zipEntries.find(
                (e) => e.entryName === entry.path
              );
              if (inputEntry) {
                const inputContent = inputEntry.getData();

                if (entry.key) {
                  const key = Buffer.from(entry.key);
                  const iv = key.slice(0, 16);
                  const cipher = crypto.createDecipheriv(
                    "aes-256-cfb8",
                    key,
                    iv
                  );
                  const decryptedContent = cipher.update(inputContent);
                  if (entry.path.endsWith(".json")) {
                    try {
                      const jsonData = JSON.parse(decryptedContent.toString());
                      newZip.addFile(
                        entry.path,
                        Buffer.from(JSON.stringify(jsonData, null, 2))
                      );
                    } catch {
                      newZip.addFile(entry.path, decryptedContent);
                    }
                  } else {
                    newZip.addFile(entry.path, decryptedContent);
                  }

                  console.log(`Decrypted ${entry.path} with key ${entry.key}`);
                }
              }
            }
            resolve({ pack_id, buffer: newZip.toBuffer() });
          } else {
            if (zipEntries.map((x) => x.entryName).includes("manifest.json"))
              resolve({ pack_id, buffer: payloadBuffer });
            else resolve();
          }
        } catch (error) {
          console.log(error);
          resolve();
        }
      })
    );
  }
  client.on("resource_pack_stack", (data) => {
    let veri = [];
    veri = [
      ...veri,
      ...data.resource_packs.map((x) => x.uuid + "_" + x.version),
    ];
    uids = veri;
    console.log(veri);
    currentID = uids.pop();
    console.log(data);
    client.write("resource_pack_chunk_request", {
      response_status: "send_packs",
      pack_id: currentID,
    });
  });
  const packMap = new Map(),
    progressbar = new ProgressBar("Downloading [:bar] :percent :etas", {
      total: 100,
      width: 40,
      complete: "=",
      incomplete: " ",
      renderThrottle: 100,
    });
  let totalChunks = 0,
    downloadedChunks = 0;
  client.on("resource_pack_data_info", (data) => {
    packMap.set(data.pack_id, {
      chunk_count: data.chunk_count,
      chunks: new Map(),
      currentChunk: 0,
    });
    totalChunks = totalChunks + Number(data.size);
    client.write("resource_pack_chunk_request", {
      response_status: "send_packs",
      pack_id: data.pack_id,
      chunk_index: packMap.get(data.pack_id).currentChunk,
    });
  });
  client.on("resource_pack_chunk_data", (data) => {
    if (!packMap.get(data.pack_id))
      packMap.set(data.pack_id, {
        chunk_count: data.chunk_count,
        chunks: new Map(),
        currentChunk: 0,
      });

    const packInfo = packMap.get(data.pack_id);
    if (packInfo) {
      packInfo.chunks.set(data.chunk_index, data.payload);
      downloadedChunks += data.payload.byteLength;
      const percent = Math.round((downloadedChunks / totalChunks) * 100);
      progressbar.update(percent / 100);
      if (packInfo.chunks.size === packInfo.chunk_count) {
        const payloadBuffer = Buffer.concat(
          Array.from(packInfo.chunks.values())
        );
        savePayloadToZip(data.pack_id, payloadBuffer);
        if (uids.length) {
          currentID = uids.pop();
          client.write("resource_pack_client_response", {
            response_status: "send_packs",
            resourcepackids: [currentID],
          });
        } else {
          client.disconnect();
        }
      } else {
        let veri = packMap.get(data.pack_id);
        veri.currentChunk++;
        client.write("resource_pack_chunk_request", {
          response_status: "send_packs",
          pack_id: data.pack_id,
          chunk_index: veri.currentChunk,
        });
        packMap.set(data.pack_id, veri);
      }
    }
  });
  client.on("close", async () => {
    const zip = new AdmZip();
    let plenth = 0;
    let zipFiles = [];
    while (plenth !== payloads.length) {
      zipFiles = await Promise.all(payloads);
      plenth = payloads.length;
    }
    zipFiles
      .filter((x) => typeof x !== "undefined")
      .forEach((buff, i) => {
        zip.addFile(`${buff.pack_id}.zip`, buff.buffer);
        if (download) {
          const zipDir = "./decrypted";
          const zipFilename = `${buff.pack_id}.zip`;
          const zipPath = path.join(zipDir, zipFilename);

          if (!fs.existsSync(zipDir)) {
            fs.mkdirSync(zipDir, { recursive: true });
          }

          fs.writeFileSync(zipPath, buff.buffer);
        }
      });
    const server = await gofile.getServer();
    if (!server?.data?.servers?.length) {
      console.log("online sunuvu bulunamadı");
      process.exit();
    }
    let sunucu =
      server?.data?.servers[
        Math.floor(Math.random() * server?.data?.servers?.length ?? 0)
      ];
    console.log("Sunucuya yükleniyor..." + sunucu.name);
    let buffer = zip.toBuffer();
    const buff = new Readable({
      read(size) {
        // Akışa buffer içeriğini ekleme
        if (buffer.length > 0) {
          this.push(buffer); // Veriyi akışa ekler
          buffer = Buffer.alloc(0); // Buffer'ı temizler
        } else {
          this.push(null); // Akışı sonlandırır
        }
      },
    });

    gofile.uploadFile(sunucu.name, buff, `${server_ip}.zip`).then(
      (x) => {
        console.warn(`${x.data.downloadPage}`);
        console.warn(`${x.data.downloadPage}`);
        console.warn(`${x.data.downloadPage}`);
      },
      (error) => console.error(`Error: ${error.message}`, error)
    );
  });
}
function createClient(options) {
  const client = new bedrock.Client({
    port: options.port || 19132,
    followPort: !options.realms,
    profilesFolder: profilesFolder,
    ...options,
    delayedInit: true,
  });
  function onServerInfo() {
    client.on("connect_allowed", () => connect(client));
    if (options.skipPing) {
      client.init();
    } else {
      bedrock
        .ping(client.options)
        .then((ad) => {
          const adVersion = ad.version?.split(".").slice(0, 3).join("."); // Only 3 version units
          client.options.version =
            options.version ??
            (Options.Versions[adVersion] ? adVersion : Options.CURRENT_VERSION);

          if (ad.portV4 && client.options.followPort) {
            client.options.port = ad.portV4;
          }

          client.conLog?.(
            `Connecting to ${client.options.host}:${client.options.port} ${
              ad.motd
            } (${ad.levelName}), version ${ad.version} ${
              client.options.version !== ad.version
                ? ` (as ${client.options.version})`
                : ""
            }`
          );
          client.init();
        })
        .catch((e) => client.emit("error", e));
    }
  }

  if (options.realms) {
    auth
      .realmAuthenticate(client.options)
      .then(onServerInfo)
      .catch((e) => client.emit("error", e));
  } else {
    onServerInfo();
  }
  return client;
}

function connect(client) {
console.log("connecting")
  // Actually connect
  client.connect();
  if (client.versionLessThanOrEqualTo("1.20.80")) {
    const keepAliveInterval = 10;
    const keepAliveIntervalBig = BigInt(keepAliveInterval);

    let keepalive;
    client.tick = 0n;

    client.once("spawn", () => {
      
      keepalive = setInterval(() => {
        // Client fills out the request_time and the server does response_time in its reply.
        client.queue("tick_sync", {
          request_time: client.tick,
          response_time: 0n,
        });
        client.tick += keepAliveIntervalBig;
      }, 50 * keepAliveInterval);

      client.on("tick_sync", async (packet) => {
        client.emit("heartbeat", packet.response_time);
        client.tick = packet.response_time;
      });
    });

    client.once("close", () => {
      clearInterval(keepalive);
    });
  }
}
