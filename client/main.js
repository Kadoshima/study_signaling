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
async function wakeupVideo() 
{
  const config = {
    video: {
      width: { exact: 4096 },
      height: { exact: 2160 }
    },
    audio: true
  };

  // 最初のカメラからのストリームを取得
  const stream1 = await navigator.mediaDevices.getUserMedia(config);
  
  // 2つ目のカメラからのストリームを取得
  const allDevices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
  if (videoDevices.length < 2) {
    console.error('2つのカメラが見つかりません。');
    return;
  }
  config.video.deviceId = videoDevices[1].deviceId;
  const stream2 = await navigator.mediaDevices.getUserMedia(config);

  // 2つのストリームをキャンバス上で横に結合
  const combinedStream = combineStreamsOnCanvas(stream1, stream2);

  combinedStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, combinedStream);
  });

  playVideo(dom.videos.local, combinedStream);
}

function combineStreamsOnCanvas(stream1, stream2) {
  const canvas = dom.canvas;
  const context = canvas.getContext('2d');
  
  // canvasのサイズを2つのビデオの幅の合計に設定
  canvas.width = 2 * stream1.getVideoTracks()[0].getSettings().width;
  canvas.height = stream1.getVideoTracks()[0].getSettings().height;

  const video1 = document.createElement('video');
  const video2 = document.createElement('video');
  
  video1.srcObject = stream1;
  video2.srcObject = stream2;
  
  video1.play();
  video2.play();

  video1.muted = true;
  video2.muted = true;

  function draw() {
    context.drawImage(video1, 0, 0, canvas.width / 2, canvas.height);
    context.drawImage(video2, canvas.width / 2, 0, canvas.width / 2, canvas.height);
    requestAnimationFrame(draw);
  }

  draw();

  const combinedStream = canvas.captureStream(30);  // 30fps
  return combinedStream;
}