/*
 * Copyright 2021 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  createApiFactory,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core';
import { todoApiRef, TodoClient } from './api';

import { rootRouteRef } from './routes';

export const todoPlugin = createPlugin({
  id: 'todo',
  apis: [
    createApiFactory({
      api: todoApiRef,
      deps: {},
      factory() {
        return new TodoClient();
      },
    }),
  ],
  routes: {
    root: rootRouteRef,
  },
});

export const EntityTodoContent = todoPlugin.provide(
  createRoutableExtension({
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
