import argparse
import asyncio
import html
import json
import os
import pty

import pyte
import websockets
from aiohttp import web


PORT = 8081
WEBSOCKETS_PORT = 8082
ENCODING = "utf-8"


class TermApp(web.Application):
    def __init__(self, loop=None):
        super().__init__(loop=loop)
        self.router.add_route("GET", "/{name}", self._handle_static)

    @staticmethod
    def _handle_static(request):
        base_dir = os.path.abspath(os.path.join(os.curdir, "static"))
        name = request.match_info["name"]
        requested = os.path.abspath(os.path.join(base_dir, name))
        common = os.path.commonprefix([base_dir, requested])
        if not common.startswith(base_dir):
            raise web.HTTPForbidden()
        try:
            with open(requested, "rb") as infile:
                body = infile.read()
        except FileNotFoundError:
            raise web.HTTPNotFound() from None
        return web.Response(body=body, content_type="text/html")


class NoCharsetScreen(pyte.Screen):
    def reset(self):
        super().reset()
        self.g0_charset = []
        self.g1_charset = []


class Screen(NoCharsetScreen, pyte.DiffScreen):
    pass


class Term:
    BUFFER_SIZE = 8192

    def __init__(self, fd, transport, loop=None):
        self._fd = fd
        self._transport = transport
        self._loop = loop
        self._screen = Screen(80, 50)
        self._stream = pyte.ByteStream()
        self._stream.attach(self._screen)
        self._something_happened = asyncio.Event(loop=loop)
        loop.add_reader(fd, self._on_data_available)

    def get_display(self):
        return "\n".join(self._screen.display)

    def get_display_as_html(self):
        output = []
        for line in self._screen.buffer:
            for char in line:
                styles = []
                if char.fg != "default":
                    styles.append("color:{};".format(char.fg))
                if char.bg != "default":
                    styles.append("background-color:{};".format(char.bg))
                if char.bold:
                    styles.append("font-weight:bold")
                if char.italics:
                    styles.append("font-style:italic")
                if styles:
                    output.append('<span style="')
                    output.append(";".join(styles))
                    output.append('">')
                output.append(html.escape(char.data))
                if styles:
                    output.append("</span>")
            output.append("\n")
        return "".join(output)

    @asyncio.coroutine
    def next_event(self):
        yield from self._something_happened.wait()
        self._something_happened.clear()

    def write(self, data):
        os.write(self._fd, data)

    def _on_data_available(self):
        data = os.read(self._fd, self.BUFFER_SIZE)
        self._stream.feed(data)
        self._something_happened.set()


@asyncio.coroutine
def _execute_shell(loop):
    # XXX loop argument
    loop = asyncio.get_event_loop()
    shell = os.environ.get("SHELL", "sh")
    environ = os.environ.copy()
    environ["TERM"] = "linux"
    (master, slave) = pty.openpty()
    (transport, _) = yield from loop.subprocess_exec(
        asyncio.SubprocessProtocol,
        shell,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        env=environ)
    return Term(master, transport, loop)


def _translate_key(event):
    key = event["key"]
    if event["ctrl"]:
        return {
            "c": "\x03",
            "d": "\x04",
            "l": "\x0c",
        }.get(key, "")
    else:
        return {
            "Backspace": "\x7f",
            "Down": "\x1b[B",
            "Enter": "\n",
            "Left": "\x1b[D",
            "Right": "\x1b[C",
            "Up": "\x1b[A",
        }.get(key, key)


@asyncio.coroutine
def term_handler(websocket, path):
    term = yield from _execute_shell(None)
    recv_task = asyncio.async(websocket.recv())
    term_task = asyncio.async(term.next_event())
    while True:
        if recv_task.done():
            recv_task = asyncio.async(websocket.recv())
        if term_task.done():
            term_task = asyncio.async(term.next_event())
        (done, _) = yield from asyncio.wait(
            [recv_task, term_task],
            return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task is term_task:
                # XXX
                term._screen.dirty.clear()
                yield from websocket.send(term.get_display_as_html())
            else:
                event = json.loads(task.result())
                term.write(_translate_key(event).encode(ENCODING))


@asyncio.coroutine
def _create_server(loop, port):
    app = TermApp(loop=loop)
    server = yield from loop.create_server(app.make_handler(),
                                           "127.0.0.1", port)
    return server


def main():
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument("--port", "-p", type=int, default=PORT)
    arguments = argument_parser.parse_args()

    loop = asyncio.get_event_loop()
    try:

        loop.run_until_complete(
            websockets.serve(term_handler, "localhost", WEBSOCKETS_PORT))
        loop.run_until_complete(_create_server(loop, arguments.port))
        loop.run_forever()
    except KeyboardInterrupt:
        pass
    finally:
        loop.close()


if __name__ == "__main__":
    main()
