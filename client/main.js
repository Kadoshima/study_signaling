//-----------------------------------------------------------------------------
// グローバル変数
//-----------------------------------------------------------------------------
const WSS_URL      = "wss://172.18.0.51:3000"; // WebSocketServerのURL
let server         = null;
let peerConnection = null;

// videoタグやtextareaなどのHTML要素
const dom = {
  videos: {
    local : document.getElementById('local_video'),
    remote: document.getElementById('remote_video'),
  },
  canvas: document.getElementById('c1'),
  sdp: {
    send: document.getElementById("text_for_send_sdp"),
    recv: document.getElementById("text_for_recv_sdp"),
  },
};

//-----------------------------------------------------------------------------
// 関数
//-----------------------------------------------------------------------------
function prepare() {
  prepareWebSocket();
  prepareRTCPeerConnection();
  wakeupVideo();
}

function connect() {
  createOffer();
}

//-----------------------------------------------------------------------------
// WebSocket系
function prepareWebSocket() 
{
  server = new WebSocket(WSS_URL);
  server.onopen = onOpen;
  server.onerror = onError;
  server.onmessage = onMessage;
}

function onOpen(e) {
  console.log("open web socket server.");
}

function onError(e) {
  console.error(e);
}

async function onMessage(e) 
{
  const text = await e.data.text();
  const msg = JSON.parse(text);

  if (msg.type === 'offer') {
    receiveSessionDescription(msg);
    await createAnswer();
    return;
  }

  if (msg.type === 'answer') {
    receiveSessionDescription(msg);
    return;
  }
}

//-----------------------------------------------------------------------------
// PeerConnection系

// RTCPeerConnectionの準備
function prepareRTCPeerConnection() 
{
  const config = {"iceServers": []};
  peerConnection = new RTCPeerConnection(config);

  peerConnection.ontrack        = onTrack;
  peerConnection.onicecandidate = onIceCandidate;
}

// OfferのSessionDescriptionを作成・セット
async function createOffer() 
{
  const sessionDescription = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(sessionDescription);
}

// AnswerのSessionDescriptionを作成・セット
async function createAnswer() 
{
  const sessionDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(sessionDescription);
}

function sendSessionDescription(description) 
{
  // JSONを文字列にして送信
  const data = JSON.stringify(description);
  server.send(data);

  // textareaに表示
  dom.sdp.send.value = description.sdp;
}

async function receiveSessionDescription(description) 
{
  // コネクションに設定
  await peerConnection.setRemoteDescription(description);

  // textareに表示
  dom.sdp.recv.value = description.sdp;
}

function onTrack(e) {
  let stream = e.streams[0];
  playVideo(dom.videos.remote, stream);
}

function onIceCandidate (e) 
{
  console.log("onicecandidate");
  
  // ICEの収集完了を待つ
  if (e.candidate !== null) return;

  // SDPの情報をシグナリングサーバーへ
  const description = peerConnection.localDescription;
  sendSessionDescription(description);
}

// カメラ関係
async function wakeupVideo() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');
  
  const config1 = {
      video: {
          deviceId: videoDevices[0].deviceId,
          width: { exact: 4096 },
          height: { exact: 2160 }
      },
      audio: true
  };

  const stream1 = await navigator.mediaDevices.getUserMedia(config1);
  playVideo(dom.videos.local, stream1);

  if (videoDevices[1]) {
      const config2 = {
          video: {
              deviceId: videoDevices[1].deviceId,
              width: { exact: 4096 },
              height: { exact: 2160 }
          }
      };

      const stream2 = await navigator.mediaDevices.getUserMedia(config2);
      playVideo(dom.videos.remote, stream2);
  }
}

function playVideo(element, stream) {
  element.srcObject = stream;
  element.play();
  element.volume = 0;

  element.onloadedmetadata = function(e) {
      console.log('Video resolution: ' + element.videoWidth + 'x' + element.videoHeight);
      drawVideoToCanvas();  // Modified function call
  };
}

function drawVideoToCanvas() {
    const context = dom.canvas.getContext('2d');

    function draw() {
        if (dom.videos.local.paused || dom.videos.local.ended || dom.videos.remote.paused || dom.videos.remote.ended) {
            return;
        }

        // キャンバスを黒でクリア
        context.fillStyle = 'black';
        context.fillRect(0, 0, dom.canvas.width, dom.canvas.height);

        // キャンバスの左半分にlocalの映像を描画
        context.drawImage(dom.videos.local, 0, 0, dom.canvas.width / 2, dom.canvas.height);

        // キャンバスの右半分にremoteの映像を描画
        context.drawImage(dom.videos.remote, dom.canvas.width / 2, 0, dom.canvas.width / 2, dom.canvas.height);
        
        requestAnimationFrame(draw);
    }

    draw();
}
