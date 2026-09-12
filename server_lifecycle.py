"""Graceful server shutdown, including owned recording conversion processes."""
import signal


def serve(server):
    def terminate(signum, frame):
        raise SystemExit(0)

    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            store = getattr(server, 'recordings', None)
            if store is not None:
                store.close()
        finally:
            server.server_close()
            signal.signal(signal.SIGTERM, previous)
