'use client';

import {useEffect, useRef} from 'react';
import {recordAttendance} from '@/lib/actions/activity';

export function AttendanceRecorder() {
  const called = useRef(false);
  useEffect(() => {
    if (called.current) return;
    called.current = true;
    recordAttendance().catch((err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AttendanceRecorder]', err);
      }
    });
  }, []);
  return null;
}
