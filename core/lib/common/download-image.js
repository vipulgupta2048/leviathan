const fs = require('fs');
const config = require('../config')
const unzipper = require('unzipper')
const { createGzip } = require('zlib')
const { Stream } = require('stream')
const util = require('util')
const request = require('request')
const progress = require('request-progress');
const { resolve } = require('any-promise');

const pipeline = util.promisify(Stream.pipeline);

const downloadPath = `${config.leviathan.downloads}/`  // Location for downloaded files
const downloadFileName = "os.img"  // Temporary name for downloaded file
const downloadFile = downloadPath + downloadFileName
const file = fs.createWriteStream(downloadFile)

class Host {
  async fetchImage() {
    return new Promise((resolve, reject) => {
      let downloadProgress = 0;

      progress(request
        .get(this.options))
        .on("response", (response) => {
          console.log(`Received ${response.statusCode} response from ${response.request.uri.hostname} downloading to ${downloadPath}`)
          response.pipe(file)
        })
        .on("end", () => {
          console.log("Download Completed");
          resolve()
        })
        .on('progress', (data) => {
          let percent = Math.round(data.percent * 100)
          if (percent >= downloadProgress + 10) {
            console.log(
              `Downloading file: ${downloadProgress}%`,
            );
            downloadProgress = percent;
          }
        })
        .on('error', async (err) => {
          file.close()
          await fs.promises.unlink(downloadFile);
          reject(err)
        })
    });
  }
}

class JenkinsAPI extends Host {
  constructor(parsedUrl) {
    super()
    this.options = {
      uri: parsedUrl.href,
      auth: `${process.env.JENKINS_USER}:${process.env.JENKINS_PASS}`
    }
  }
}

class genericAPI extends Host {
  // https://api.balena-cloud.com/download?deviceType=coral-dev&version=2.108.26&fileType=.zip&developmentMode=true
  constructor(parsedUrl) {
    super()
    this.options = {
      uri: parsedUrl.href,
    }
  }
}


function downloadSource(parsedUrl) {
  switch (parsedUrl.hostname) {
    case 'jenkins.product-os.io':
      return new JenkinsAPI(parsedUrl)
    default:
      return new genericAPI(parsedUrl)
  }
}

async function isGzip(filePath) {
  const buf = Buffer.alloc(3);
  const fileHandle = await fs.promises.open(filePath, 'r')
  await fileHandle.read(buf, 0, 3, 0);
  await fileHandle.close()
  return buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08;
}

async function isZip(filepath) {
  const buf = Buffer.alloc(4);
  const fileHandle = await fs.promises.open(filepath, 'r')
  await fileHandle.read(buf, 0, 4, 0)
  await fileHandle.close()

  return buf[0] === 0x50 && buf[1] === 0x4B && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) && (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08);
}


async function decompress() {
  return new Promise(async (resolve, reject) => {
    if (await isZip(downloadFile)) {
      fs.createReadStream(downloadFile)
        .pipe(unzipper.Parse())
        .on('entry', async (entry) => {
          const fileName = entry.path;
          const type = entry.type; // 'Directory' or 'File'
          console.log(entry)
          if (type === 'File') {
            console.log(`Unzipping ${fileName} --> ${config.leviathan.uploads.image}`)
            entry.pipe(fs.createWriteStream(config.leviathan.uploads.image));
            await fs.promises.unlink(downloadFile)
            resolve()
          }
        });
    } else if (await isGzip(downloadFile)) {
      console.log("Unzipping Gzip file")
      await pipeline(
        fs.createReadStream(downloadFile),
        zlib.createGzip({ level: 6 }),
        fs.createWriteStream(config.leviathan.uploads.image)
      )
      await fs.promises.unlink(downloadFile)
      resolve()
    } else {
      await fs.promises.rename(downloadFile, config.leviathan.uploads.image) // Moving the file
      console.log("No decompression needed")
      resolve()
    }
  })
}



/**
 * Function to download OS images
 * @param imageURL - string defining the target URL of the image
 */
module.exports = {
  downloadImage: async (imageUrl) => {
    // return new Promise(resolve, async () => {
    const parsedUrl = (new URL(imageUrl)); // parse the URL
    const ImageHost = downloadSource(parsedUrl) // Check the host from where the image will be downloaded, add in credentials
    await ImageHost.fetchImage()
    await decompress()
    console.log("Decompression completed")
  }
}


// (async () => {
//   // Test Files
//   // await downloadImage('https://speed.hetzner.de/10s0MB.bin')
//   await downloadImage('https://sample-videos.com/zip/30mb.zip')
// })();