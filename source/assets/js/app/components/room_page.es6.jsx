class RoomPage extends React.Component {
  constructor(props){
    super(props)

    this.state = {
      peerOnStage: null,
      uiState: "user_media_configurator",
      peers: [],
    }
  }

  getUserMediaTitles(userMediaConfig){
    if(userMediaConfig.audio && !userMediaConfig.video){
      return 'Microphone'
    } else if(!userMediaConfig.audio && userMediaConfig.video){
      return 'Webcam'
    } else if(!userMediaConfig.audio && !userMediaConfig.video){
      return 'Nothing'
    } else {
      return 'Webcam and Microphone'
    }
  }

  checkStage(){
    var remotes = this.state.rtc.room && this.state.rtc.room.getRemotePeers()

    if(!remotes || this.state.peerOnStage && this.state.peerOnStage.id == this.state.rtc.room.getLocalPeer().id){
      // nothing
    } else if(remotes.length == 0){
      this.setPeerOnStage(null)
    } else if(remotes.length >= 1 && !this.state.peerOnStage){
      this.setPeerOnStage(remotes[0])
    }
  }

  checkPeers(){
    this.setState({
      peers: this.state.rtc.room.getAllPeers()
    })
  }

  ///
  // public

  setPeerOnStage(peer){
   if(!peer || !peer.getStream())
     this.setState({peerOnStage: null})
   else if(this.state.peerOnStage != peer){
     this.setState({peerOnStage: peer})
     // if(!peer.isLocal()){
     //   palava.browser.fixAudio($('.plv-video-wrapper[data-peer-id=' + peer.id + ']'))
     // }
   }
  }

  // applyMuteStatuses(){ // chrome workaround :(
  //   $('.plv-video-wrapper video').prop('muted', true)
  //   $('.plv-video-wrapper [data-peer-muted=false]~video').prop('muted', false)
  // }

  initConference(userMediaConfig){
    this.setState({
      userMediaTitles: this.getUserMediaTitles(userMediaConfig),
      uiState: 'waiting_for_user_media',
    }, () => {
      $('#share-link').focus()

      this.state.rtc.init({
        identity: new palava.Identity({
          userMediaConfig: userMediaConfig
        }),
        options: {
          stun: "stun:stun.palava.tv",
          joinTimeout: 500,
        }
      })
    })
  }

  updateUiState(newUiState, prevUiState){
    if(newUiState === prevUiState){ return }

    setTimeout(() => {
      switch(newUiState){
        case "user_media_configurator": {
          $('.modal').modal('hide')
          $('#modal-user-media-configurator').modal('show')
          break
        }
        case "waiting_for_user_media": {
          $('.modal').modal('hide')
          $('#modal-user-media').modal('show')
          break
        }
        case "user_media_error": {
          $('.modal').modal('hide')
          $('#modal-user-media').modal('show')
          $('#modal-user-media .alert').show()
          break
        }
        case "maintenance": {
          $('.modal').modal('hide')
          $('#modal-maintenance').modal('show')
          break
        }
        case "conference": {
          $('.modal').modal('hide')
          $('.modal-backdrop').hide()
          break
        }
      }
    })
  }

  setupRtc(){
    rtc = new palava.Session({
      roomId: this.props.params.roomId,
      peers: [],
      channel: new palava.WebSocketChannel("ws:localhost:4233"),
    })

    rtc.on('argument_error', (e) => {
      logger.error('internal error', e)
    })

    rtc.on('webrtc_no_support', () => {
      if(this.props.params.supported !== '1'){
        logger.error('webrtc not supported')
        goHome()
      }
    })

    rtc.on('webrtc_partial_support', () => {
      logger.warn('webrtc only partially supported!')
      palavaAlert('<strong>Warning:</strong> Your browser is not fully supported. See <a href="/info/how">How it Works</a> for more informations. Please update or use another browser to avoid compability issues!')
    })

    rtc.on('signaling_not_reachable', () => {
      logger.error('signaling server not reachable')
      palavaAlert('Unfortunately, the palava rtc server seems to be down! Please try again later!')
    })

    rtc.on('signaling_error', (error) => {
      logger.error('signaling error', error)
    })

    rtc.on('signaling_shutdown', (seconds) => {
      logger.warn("Sorry, your connection will be reset in " + seconds + " seconds!")
      this.setState({ uiState: 'maintenance' })
    })

    rtc.on('room_join_error', () => {
      logger.error('room not joinable')
      palavaAlert('Unfortunately, the palava rtc server seems to be down! Please try again later!') // TODO modal
    })

    rtc.on('room_full', () => {
      palavaAlert('Sorry, the conference room <strong>' + this.props.params.roomId + '</strong> is full! Please <a href="javascript:window.location.reload()">try again</a> or go back to the <a href="/#/">homepage</a>!') // TODO oo
    })

    rtc.on('room_joined', (room) => {
      logger.log('room joined with ' + (room.getRemotePeers().length) + ' other peers')
      this.checkPeers()
    })

    rtc.on('local_stream_ready', (stream) => {
      logger.log('local stream ready', stream)
      this.setState({
        uiState: 'conference'
      }, () => {
        rtc.room.join()
      })
    })

    rtc.on('local_stream_error', (error) => {
      logger.log('local stream error', error)
      this.setState({
        uiState: 'user_media_error'
      })
    })

    rtc.on("peer_joined", (peer) => {
      logger.log('peer joined', peer)
      this.checkPeers()
    })

    rtc.on("peer_stream_ready", (peer) => {
      logger.log('peer stream ready', peer)
      this.checkStage()
    })

    rtc.on("peer_update", (peer) => {
      logger.log('peer updated status', peer)
    })

    rtc.on("peer_stream_removed", (peer) => {
      logger.log('peer stream removed', peer)
      this.checkStage()
    })

    rtc.on("peer_left", (peer) => {
      logger.log('peer left', peer)
      this.checkStage()
      this.checkPeers()
    })

    rtc.on("session_before_destroy", () => {
      logger.log('destroying rtc session')
    })

    rtc.on("session_after_destroy", () => {
      $('.modal').modal('hide')
      $('.modal-backdrop').hide()
    })

    this.setState({ rtc })
  }


  componentDidMount() {
    if(this.props.params.supported === '0'){
      goHome()
    } else if(this.props.params.roomId.length > 50){
      window.location.replace(this.props.params.roomId.substr(0,50))
    } else {
      this.updateUiState(this.state.uiState)
      this.setupRtc()
    }
  }

  componentDidUpdate(prevProps, prevState) {
    this.updateUiState(this.state.uiState, prevState.uiState)
  }

  componentWillUnmount() {
    if(this.state.rtc){ this.state.rtc.destroy() }
  }

  render(){
    const props = this.props
    const state = this.state
    const peers = state.peers // | orderBy: 'joinTime'"

    const palavaDomain = "palava.tv"
    const encodedRoomId = encodeURIComponent(props.params.roomId)
    const isSecretConference = /^\w{8}(-\w{4}){3}-\w{12}$/.test(props.params.roomId)

    if(isSecretConference){
      var readableRoomId = "Secret Conference"
      var roomClasses = "palava-private-room"
    } else {
      var readableRoomId = decodeURIComponent(props.params.roomId)
      var roomClasses = "palava-room"
    }

    const peerList = peers.map( (peer) => {
      return <Peer
          peer={peer}
          key={peer.id}
          id={peer.id}
          active={peer === state.peerOnStage}
          noLocalAudio={!state.rtc.userMedia.config.audio}
          setPeerOnStageFn={this.setPeerOnStage.bind(this)}
          />
    })

    if(state.peerOnStage){
      var peerOnStageOrPlaceholder = <WebrtcVideo peer={state.peerOnStage}/>
    } else {
      var peerOnStageOrPlaceholder = <PeerOnStagePlaceholder/>
    }

    return (
      <div>
        <nav className="navbar navbar-fixed-top">
          <div className="navbar-inner conference-nav">
            <p id="palava-alert" className="alert hide">
              <button type="button" className="close" data-dismiss="alert">&times;</button>
              <span className="alert-content"></span>
            </p>

            <ShareLink link={ palavaDomain + "/" + encodedRoomId } />

            <div className="navbar-header">
              <Link to={'/' + encodedRoomId} className={roomClasses}>{ readableRoomId }</Link>
            </div>
          </div>
        </nav>

        <div id="conference" className="container-fluid">
          <div className="row-fluid row">

            <div className="span-fixed-sidebar plv-stage-container">
              <div className="row-fluid">
                <div className="stage plv-stage">
                  { peerOnStageOrPlaceholder }
                </div>
              </div>
            </div>

            <div className="plv-video-bar">
              <aside className="well sidebar-nav-fixed">
                <ul className="nav plv-participants">
                  { peerList }
                </ul>
              </aside>
            </div>
          </div>
        </div>
        <Footer/>

        <UserMediaConfiguratorModal
            initConferenceFn={this.initConference.bind(this)}
            />
        <UserMediaHintModal
            userMediaTitles={this.state.userMediaTitles}
            />
        <MaintenanceModal/>
      </div>
    )
  }
}
