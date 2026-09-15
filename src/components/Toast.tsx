import { useEffect, useState } from "react";

let push: ((msg: string) => void) | null = null;

export function toast(msg: string) {
  push?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer = 0;
    push = (next) => {
      setMsg(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 1800);
    };
    return () => {
      push = null;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={"toast" + (msg ? " show" : "")} role="status">
      {msg}
    </div>
  );
}
