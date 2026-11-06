const fs = require('fs');
const path = require('path');
const {dialog} = require('electron').remote;

import I18 from '../../utils/I18';

class Downloader {

    static run(files, fileName, savePath) {

        let dir = savePath;

        if(!dir) {
            dir = dialog.showOpenDialog({
                properties: ['openDirectory']
            });
        }

        if(dir) {
            dir = String(dir);

            let complete = async () => {
                for(let file of files) {
                    let content = file.content;
                    if(file.base64) content = Buffer.from(content, 'base64');
                    else if(content && typeof content.arrayBuffer === 'function') {
                        content = Buffer.from(await content.arrayBuffer());
                    }
                    else if(ArrayBuffer.isView(content)) {
                        content = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
                    }
                    else if(content && typeof Blob !== 'undefined' && content instanceof Blob) {
                        content = await new Promise((resolve, reject) => {
                            let reader = new FileReader();
                            reader.onload = () => resolve(Buffer.from(reader.result));
                            reader.onerror = () => reject(reader.error);
                            reader.readAsArrayBuffer(content);
                        });
                    }

                    let savePath = path.normalize(dir + "/" + file.name);
                    savePath = savePath.split("\\").join("/");

                    let saveDirParts = savePath.split("/");
                    saveDirParts.pop();
                    let currentPath = '';
                    while(saveDirParts.length) {
                        currentPath = currentPath + saveDirParts.shift() + '/';
                        if(!fs.existsSync(currentPath)) {
                            fs.mkdirSync(currentPath);
                        }
                    }

                    fs.writeFileSync(savePath, content);
                }
            };

            let exists = false;
            for(let file of files) {
                if(fs.existsSync(path.normalize(dir + "/" + file.name))) {
                    exists = true;
                    break;
                }
            }

            if(exists) {
                dialog.showMessageBox({buttons: ["Yes","No","Cancel"], message: I18.f('REPLACE_FILES_PROMPT')}, (res) => {
                    if(res === 0) complete();
                });
            }
            else {
                complete();
            }
        }
    }
}

export default Downloader;
