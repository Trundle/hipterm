var Screen = React.createClass({
  getInitialState: function () {
    return {dirty: []};
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
      var lines = JSON.parse(event.data),
          dirty = Object.keys(lines);
      lines.dirty = dirty;
      this.setState(lines);
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
    var dirty = this.state.dirty,
        state = this.state;
    var lines = Object.keys(state)
      .filter(function (element) { return element !== "dirty"; })
      .map(function (lineno) {
        var line = state[lineno];
        return <Line key={lineno} dirty={dirty.indexOf(lineno) !== -1} chars={line} />
      });
    return (
      <div>{lines}</div>
    );
  }
});


var Line = React.createClass({
  render: function () {
    var charNodes = this.props.chars.map(function (char, col) {
      return <Char key={col} char={char} />
    });
    return <div>{charNodes}</div>
  },

  shouldComponentUpdate: function(nextProps, nextState) {
    return nextProps.dirty;
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