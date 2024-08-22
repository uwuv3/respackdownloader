const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
let download=true
let json = {
  must_accept: true,
  has_addons: false,
  has_scripts: false,
  force_server_packs: false,
  behaviour_packs: [],
  texture_packs: [
    {
      uuid: "5583ed6f-382c-4749-a719-0f76b560fa16",
      version: "2.0.0",
      size: 315913n,
      content_key: "HnZgIu0ZanLLohwmwZ1LAbxeklOTbmD6",
      sub_pack_name: "",
      content_identity: "5583ed6f-382c-4749-a719-0f76b560fa16",
      has_scripts: false,
      addon_pack: false,
      rtx_enabled: false,
    },
    {
      uuid: "f8ed11ae-667a-4d5c-93c8-0c240b277a16",
      version: "7.5.0",
      size: 3898516n,
      content_key: "X9xDsnmYu85aHCbpnvUi175J5ai9DeLh",
      sub_pack_name: "",
      content_identity: "f8ed11ae-667a-4d5c-93c8-0c240b277a16",
      has_scripts: false,
      addon_pack: false,
      rtx_enabled: false,
    },
  ],
  resource_pack_links: [],
};
let packs = json.texture_packs.map((x) => {
    x.text = x.uuid + "_" + x.version;
    return x;
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
let saved_files= []
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
              `${pack_id}}${entry.entryName
                .replace(/\//, "_")
                .replace(".zip", "")}`,
              content
            );
          }
        }
        if (entry.isDirectory) {
          const folderBuffer = compressFolder(zipEntries, entry.entryName);
          if (folderBuffer)
            savePayloadToZip(
              `${pack_id}}${entry.entryName.replace(/\//, "_")}`,
              folderBuffer
            );
        }
      });
      try {
        console.log(pack_id,)
        let key = packs.find(
          (x) => x.text == pack_id.replace(".zip","").split("}")[0] || x.uuid == pack_id.replace(".zip","").split("}")[0]
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
                const cipher = crypto.createDecipheriv("aes-256-cfb8", key, iv);
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
function processDirectory(directory) {
  // Read the directory contents
  const files = fs.readdirSync(directory);

  files.forEach((file) => {
    const filePath = path.join(directory, file);

    // Read the file buffer (or any other data needed)
    const buffer = fs.readFileSync(filePath);

    // Call the savePayloadToZip function
    savePayloadToZip(file, buffer);
  });
}
(async () => {
  processDirectory("./zeqa.net");
  const zip = new AdmZip();
  let plenth = 0;
  let zipFiles;
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
})();
