var DATA = 0,
    FG = 1,
    BG = 2,
    BOLD = 3,
    ITALICS = 4;

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


var groupChars = function (chars) {
  if (!chars.length) {
    return [];
  }

  var grouped = []
    , last = chars[DATA];
  for (var i = 1; i < chars.length; ++i) {
    var char = chars[i];
    if (char[FG] == last[FG] && char[BG] == last[BG]) {
      last[DATA] += char[DATA];
    } else {
      grouped.push(last);
      last = char;
    }
  }
  grouped.push(last);
  return grouped;
};


var Line = React.createClass({
  render: function () {
    var charNodes = groupChars(this.props.chars)
      .map(function (char, col) {
        return <Char key={col+"-"+char[DATA].length} char={char} />
      });
    return <div>{charNodes}</div>
  },

  shouldComponentUpdate: function(nextProps, nextState) {
    return nextProps.dirty;
  }
});

var Char = React.createClass({
  render: function () {
    var char = this.props.char
      , classes = [];
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