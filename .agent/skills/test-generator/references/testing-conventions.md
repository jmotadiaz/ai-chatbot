# Testing Architecture Rules

1. **Locator Isolation (Strict)**:
   - Locators MUST ONLY be defined in Page Objects or Component Objects.
   - **Prohibition**: Locators are strictly forbidden inside `.spec.ts` files.

2. **Page Object Pattern**:
   - **Page Objects**: Represent entire pages and compose multiple components.
   - **Component Objects**: Represent reusable UI sections.
   - **Composition**: All components must receive a `Locator` container in their constructor to enable scoped selectors.

3. **Assertions**:
   - Use soft assertions (`expect.soft()`) in spec files to allow test continuity.
   - Use standard `expect()` in Page Objects only for synchronization/waiting.

4. **Selector Priority**: When defining locators in Page/Component objects, follow this order:
   - `getByRole`: Preferred for semantic elements.
   - `getByLabel`: Preferred for form inputs.
   - `getByTestId`: Used for component containers or as a last resort.
