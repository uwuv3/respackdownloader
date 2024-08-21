Usage:
```bash
apt update -y && apt upgrade -y && apt install nodejs -y && apt install git -y && apt install build-essential cmake clang -y && git config --global credential.helper store && cd && if [ ! -d "respackdownloader" ]; then git clone https://github.com/uwuv3/respackdownloader.git; fi && cd respackdownloader && SKIP_BUILD=true npm install && node index.js
```
