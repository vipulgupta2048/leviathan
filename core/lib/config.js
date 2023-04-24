module.exports = {
  leviathan: {
    artifacts: '/tmp/artifacts',    // To store artifacts meant to be reported as results at the end of the suite
    downloads: '/data/downloads',   // To store/download assets needed for the suite (non-persistent) 
    reports: '/reports/',           // To store/download reports generated from the suite (non-persistent) 
    workdir: '/data',
    uploads: {
      image: '/data/os.img',
      config: '/data/config.json',
      suite: '/data/suite'
    }
  }
};

curl --request POST \
  --url 'https://api.github.com/repos/vipulgupta2048/leviathan/dispatches' \
  --header 'authorization: token $GITHUB_TOKEN' \
  --data '{"leviathan_genericx86-ext": ""}'
