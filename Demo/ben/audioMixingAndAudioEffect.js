var client; // Agora client
var localTracks = {
  videoTrack: null,
  audioTrack: null,
  audioMixingTrack: null,
  audioEffectTrack: null
};
var remoteUsers = {};
// Agora client options
var options = { 
  appid: null,
  channel: null,
  uid: null,
  token: null
};
var audioMixing = {
  state: "IDLE", // "IDLE" | "LOADING | "PLAYING" | "PAUSE"
  duration: 0
}

const playButton = $(".play");
let audioMixingProgressAnimation;

// you can find all the agora preset video profiles here https://docs.agora.io/cn/Voice/API%20Reference/web/interfaces/agorartc.stream.html#setvideoprofile
var videoProfiles = [
  { label: "480p_1", detail: "640×480, 15fps, 500Kbps", value: "480p_1" },
  { label: "480p_2", detail: "640×480, 30fps, 1000Kbps", value: "480p_2" },
  { label: "720p_1", detail: "1280×720, 15fps, 1130Kbps", value: "720p_1" },
  { label: "720p_2", detail: "1280×720, 30fps, 2000Kbps", value: "720p_2" },
  { label: "1080p_1", detail: "1920×1080, 15fps, 2080Kbps", value: "1080p_1" },
  { label: "1080p_2", detail: "1920×1080, 30fps, 3000Kbps", value: "1080p_2" },
  { label: "200×640", detail: "200×640, 30fps", value: { width: 200, height: 640, frameRate: 30 } } // custom video profile
]

var curVideoProfile;
var mics = []; // all microphones devices you can use
var cams = []; // all cameras devices you can use
var currentMic; // the microphone you are using
var currentCam; // the camera you are using

let volumeAnimation;



// the demo can auto join channel with params in url
$(async () => {
  initVideoProfiles();
  $(".profile-list").delegate("a", "click", function(e){
    changeVideoProfile(this.getAttribute("label"));
  });


  $("#media-device-test").modal("show");
  $(".cam-list").delegate("a", "click", function(e){
    switchCamera(this.text);
  });
  $(".mic-list").delegate("a", "click", function(e){
    switchMicrophone(this.text);
  });


  var urlParams = new URL(location.href).searchParams;
  options.appid = urlParams.get("appid");
  options.channel = urlParams.get("channel");
  options.token = urlParams.get("token");
  if (options.appid && options.channel) {
    $("#appid").val(options.appid);
    $("#token").val(options.token);
    $("#channel").val(options.channel);
    //$("#join-form").submit();
    await mediaDeviceTest();
    volumeAnimation = requestAnimationFrame(setVolumeWave);
  }
})



$("#join-form").submit(async function (e) {
  e.preventDefault();
  $("#join").attr("disabled", true);
  $("#device-wrapper").css("display", "flex");
  try {
    options.appid = $("#appid").val();
    options.token = $("#token").val();
    options.channel = $("#channel").val();
    await join();
    if(options.token) {
      $("#success-alert-with-token").css("display", "block");
    } else {
      //$("#success-alert a").attr("href", `index.html?appid=${options.appid}&channel=${options.channel}&token=${options.token}`);
      //$("#success-alert").css("display", "block");
    }
  } catch (error) {
    console.error(error);
  } finally {
    $("#leave").attr("disabled", false);
    $("#audio-mixing").attr("disabled", false);
    $("#audio-effect").attr("disabled", false);
    $("#stop-audio-mixing").attr("disabled", false);
    $("#local-audio-mixing").attr("disabled", false);
  }
})

$("#leave").click(async function (e) {
  leave();
})

$("#audio-mixing").click(function (e) {
  startAudioMixing();
})

$("#audio-effect").click(async function (e) {
  // play the audio effect
  await playEffect(1, { source: "audio.mp3" });
  console.log("play audio effect success");
})

$("#stop-audio-mixing").click(function (e) {
  stopAudioMixing();
  return false;
})

$(".progress").click(function (e) {
  setAudioMixingPosition(e.offsetX);
  return false;
})

$("#local-audio-mixing").click(function (e) {
  // get selected file
  const file = $("#local-file").prop("files")[0];
  if (!file) {
    console.warn("please choose a audio file");
    return;
  }
  startAudioMixing(file);
  return false;
})

playButton.click(function() {
  if (audioMixing.state === "IDLE" || audioMixing.state === "LOADING") return;
    toggleAudioMixing();
    return false;
});

function setAudioMixingPosition(clickPosX) {
  if (audioMixing.state === "IDLE" || audioMixing.state === "LOADING") return;
  const newPosition = clickPosX / $(".progress").width();

  // set the audio mixing playing position
  localTracks.audioMixingTrack.seekAudioBuffer(newPosition * audioMixing.duration);
}

async function startAudioMixing(file) {
  if(audioMixing.state === "PLAYING" || audioMixing.state === "LOADING") return;
  const options = {};
  if (file) {
    options.source = file;
  } else {
    options.source = "HeroicAdventure.mp3";
  }
  try {
    audioMixing.state = "LOADING";
    // if the published track will not be used, you had better unpublish it
    if(localTracks.audioMixingTrack) {
      await client.unpublish(localTracks.audioMixingTrack);
    }
    // start audio mixing with local file or the preset file
    localTracks.audioMixingTrack = await AgoraRTC.createBufferSourceAudioTrack(options);
    await client.publish(localTracks.audioMixingTrack);
    localTracks.audioMixingTrack.play();
    localTracks.audioMixingTrack.startProcessAudioBuffer({ loop: true });

    audioMixing.duration = localTracks.audioMixingTrack.duration;
    $(".audio-duration").text(toMMSS(audioMixing.duration));
    playButton.toggleClass('active', true);
    setAudioMixingProgress();
    audioMixing.state = "PLAYING";
    console.log("start audio mixing");
  } catch (e) {
    audioMixing.state = "IDLE";
    console.error(e);
  }
}

function stopAudioMixing() {
  if (audioMixing.state === "IDLE" || audioMixing.state === "LOADING") return;
  audioMixing.state = "IDLE";

  // stop audio mixing track
  localTracks.audioMixingTrack.stopProcessAudioBuffer();
  localTracks.audioMixingTrack.stop();

  $(".progress-bar").css("width", "0%");
  $(".audio-current-time").text(toMMSS(0));
  $(".audio-duration").text(toMMSS(0));
  playButton.toggleClass('active', false);
  cancelAnimationFrame(audioMixingProgressAnimation);
  console.log("stop audio mixing");
}

function toggleAudioMixing() {
  if (audioMixing.state === "PAUSE") {
    playButton.toggleClass('active', true);
    
    // resume audio mixing
    localTracks.audioMixingTrack.resumeProcessAudioBuffer();

    audioMixing.state = "PLAYING";
  } else {
    playButton.toggleClass('active', false);

    // pause audio mixing
    localTracks.audioMixingTrack.pauseProcessAudioBuffer();

    audioMixing.state = "PAUSE";
  }
}

function setAudioMixingProgress() {
  audioMixingProgressAnimation = requestAnimationFrame(setAudioMixingProgress);
  const currentTime = localTracks.audioMixingTrack.getCurrentTime();
  $(".progress-bar").css("width", `${currentTime / audioMixing.duration * 100}%`);
  $(".audio-current-time").text(toMMSS(currentTime));
}

// use buffer source audio track to play effect.
async function playEffect(cycle, options) {
  // if the published track will not be used, you had better unpublish it
  if(localTracks.audioEffectTrack) {
    await client.unpublish(localTracks.audioEffectTrack);
  }
  localTracks.audioEffectTrack = await AgoraRTC.createBufferSourceAudioTrack(options);
  await client.publish(localTracks.audioEffectTrack);
  localTracks.audioEffectTrack.play();
  localTracks.audioEffectTrack.startProcessAudioBuffer({ cycle });
}

async function join() {
  // create Agora client
  client = AgoraRTC.createClient({ mode: "rtc", codec: "h264" });

  // add event listener to play remote tracks when remote user publishs.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  // join a channel and create local tracks, we can use Promise.all to run them concurrently
  [ options.uid, localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
    // join the channel
    client.join(options.appid, options.channel, options.token || null),
    // create local tracks, using microphone and camera
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);
  // play local video track
  localTracks.videoTrack.play("local-player");
  //$("#local-player-name").text(`localVideo(${options.uid})`);

  // publish local tracks to channel
  await client.publish(Object.values(localTracks).filter(track => track !== null));

  console.log("publish success");
}


async function mediaDeviceTest() {
  // create local tracks
  [ localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
    // create local tracks, using microphone and camera
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);

  // play local track on device detect dialog
  localTracks.videoTrack.play("pre-local-player");
  // localTracks.audioTrack.play();

  // get mics
  mics = await AgoraRTC.getMicrophones();
  currentMic = mics[0];
  $(".mic-input").val(currentMic.label);
  mics.forEach(mic => {
    $(".mic-list").append(`<a class="dropdown-item" href="#">${mic.label}</a>`);
  });

  // get cameras
  cams = await AgoraRTC.getCameras();
  currentCam = cams[0];
  $(".cam-input").val(currentCam.label);
  cams.forEach(cam => {
    $(".cam-list").append(`<a class="dropdown-item" href="#">${cam.label}</a>`);
  });
}

async function leave() {
  stopAudioMixing();
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if(track) {
      track.stop();
      track.close();
      localTracks[trackName] = null;
    }
  }
  // remove remote users and player views
  remoteUsers = {};
  $("#remote-playerlist").html("");

  // leave the channel
  await client.leave();

  //$("#local-player-name").text("");
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  $("#audio-mixing").attr("disabled", true);
  $("#audio-effect").attr("disabled", true);
  $("#stop-audio-mixing").attr("disabled", true);
  $("#local-audio-mixing").attr("disabled", true);
  $("#device-wrapper").css("display", "none");
  console.log("client leaves channel success");
}

async function subscribe(user, mediaType) {
  const uid = user.uid;
  // subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("subscribe success");
  if (mediaType === 'video') {
    const player = $(`
      <div id="player-wrapper-${uid}">

        <div id="player-${uid}" class="player"></div>
      </div>
    `);
    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }
  if (mediaType === 'audio') {
    user.audioTrack.play();
  }
}

function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user) {
  const id = user.uid;
  delete remoteUsers[id];
  $(`#player-wrapper-${id}`).remove();
}

// calculate the MM:SS format from millisecond
function toMMSS(second) {
  // const second = millisecond / 1000;
  let MM = parseInt(second / 60);
  let SS = parseInt(second % 60);
  MM = MM < 10 ? "0" + MM : MM;
  SS = SS < 10 ? "0" + SS : SS;
  return `${MM}:${SS}`;
}


function initVideoProfiles () {
  videoProfiles.forEach(profile => {
    $(".profile-list").append(`<a class="dropdown-item" label="${profile.label}" href="#">${profile.label}: ${profile.detail}</a>`)
  });
  curVideoProfile = videoProfiles[0];
  $(".profile-input").val(`${curVideoProfile.detail}`);
}

async function changeVideoProfile (label) {
  curVideoProfile = videoProfiles.find(profile => profile.label === label);
  $(".profile-input").val(`${curVideoProfile.detail}`);
  // change the local video track`s encoder configuration
  localTracks.videoTrack && await localTracks.videoTrack.setEncoderConfiguration(curVideoProfile.value);
}


async function switchCamera(label) {
  currentCam = cams.find(cam => cam.label === label);
  $(".cam-input").val(currentCam.label);
  // switch device of local video track.
  await localTracks.videoTrack.setDevice(currentCam.deviceId);
}

async function switchMicrophone(label) {
  currentMic = mics.find(mic => mic.label === label);
  $(".mic-input").val(currentMic.label);
  // switch device of local audio track.
  await localTracks.audioTrack.setDevice(currentMic.deviceId);
}

// show real-time volume while adjusting device. 
function setVolumeWave() {
  volumeAnimation = requestAnimationFrame(setVolumeWave);
  $(".progress-bar").css("width", localTracks.audioTrack.getVolumeLevel() * 100 + "%")
  $(".progress-bar").attr("aria-valuenow", localTracks.audioTrack.getVolumeLevel() * 100)
}
