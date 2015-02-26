var flatten = function (A) {
  return [].concat.apply([], A);
};

var Screen = React.createClass({
  getInitialState: function () {
    return {buffer: []};
  },

  componentDidMount: function () {
    var ws = new WebSocket(COMM_URL),
        connected = false;
    ws.onopen = function (event) {
      connected = true;
    };
    ws.onclose = function (event) {
      connected = false;
    };
    ws.onmessage = function (event) {
      this.setState({buffer: JSON.parse(event.data)});
    }.bind(this);
    $(document).keypress(function (event) {
      if (connected) {
        ws.send(JSON.stringify({event: "keypress", key: event.key, ctrl: event.ctrlKey}));
      }
      event.preventDefault();
    });
    $(document).focus();
  },

  render: function () {
    var lineNodes = this.state.buffer.map(function (line, lineno) {
      return line.concat(["\n"]).map(function (char, col) {
        return <Char key={lineno + "-" + col} char={char} />
      });
    });
    return (
      <div>{flatten(lineNodes)}</div>
    );
  }
});

var Char = React.createClass({
  render: function () {
    var DATA = 0,
        FG = 1,
        BG = 2,
        BOLD = 3,
        ITALICS = 4,
        char = this.props.char;
    var classes = [];
    if (char[FG] != "default") {
      classes.push("color-" + char[FG]);
    }
    if (char[BG] != "default") {
      classes.push("bg-" + char[BG]);
    }
    return (
      <span className={classes.join(" ")}>{char[DATA]}</span>
    );
  }
});

React.render(
  <Screen />,
  document.getElementById('scrn')
);