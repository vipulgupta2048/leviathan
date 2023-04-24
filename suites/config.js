module.exports = [{
  deviceType: process.env.DEVICE_TYPE,
  suite: `${__dirname}/../suites/e2e`,
  config: {
    networkWired: false,
    networkWireless: process.env.WORKER_TYPE === 'qemu' ? false : true,
    downloadVersion: 'latest',
    balenaApiKey: process.env.BALENACLOUD_API_KEY,
    balenaApiUrl: 'balena-cloud.com',
    organization: process.env.BALENACLOUD_ORG
  },
  image: process.env.JENKINS_IMAGE_URL,
  // image: `https://api.balena-cloud.com/download?deviceType=generic-amd64&version=2.113.12&fileType=.zip&developmentMode=true`,
  debug: {
    unstable: ["Kill the device under test"],
  },
  workers: process.env.WORKER_TYPE === 'qemu' ? ['http://worker'] : {
		balenaApplication: process.env.BALENACLOUD_APP_NAME,
		apiKey: process.env.BALENACLOUD_API_KEY,
	},
}];
