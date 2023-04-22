/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

import { useState, useEffect } from 'react';
import { useGlobalStateContext } from '../contexts/GlobalStateContext';
import { serverUrl } from '../config';

const useFetchStart = (fetchNow, threadId = null ) => {
  const { globalState } = useGlobalStateContext();
  const [fetchResponse, setFetchResponse] = useState('');
  const [fetched, setFetched] = useState('');

  useEffect(() => {
    if (fetchNow) {

      console.log("useFetchStart ", fetchNow)

      async function fetchStart() {

        const requestOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            sessionId: globalState.sessionId,
            startId: fetchNow,
            threadId: threadId,
            address: globalState?.address,
          }),
        };

        const response = await fetch(`${serverUrl}api/task/start`, requestOptions);
        const data = await response.json();
        console.log("Response from fetchStart ", data)

        if (data?.error) {
          console.log("ERROR " + data.error.message);
        }
        setFetchResponse(data);
        setFetched(data.id);

      }

      fetchStart().catch((error) => {
        console.log("ERROR " + error.message);
        setFetched(false);
      });
    }
  }, [fetchNow]);

  return { fetchResponse, fetched };
};

export default useFetchStart;