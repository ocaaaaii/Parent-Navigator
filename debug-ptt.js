// 執行：node debug-ptt.js
const https = require('https');

function fetchUrl(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: 'over18=1' } }, (resp) => {
      let d = ''; resp.setEncoding('utf8');
      resp.on('data', c => d += c);
      resp.on('end', () => res({ status: resp.statusCode, body: d }));
    }).on('error', rej).setTimeout(10000, function(){ this.destroy(); });
  });
}

(async () => {
  const { status, body } = await fetchUrl('https://www.ptt.cc/bbs/BabyMother/index.html');
  console.log('Status:', status);
  console.log('Body length:', body.length);
  // 印出前 3000 字看 HTML 結構
  console.log('\n=== 前 3000 字 ===\n', body.slice(0, 3000));
})();
