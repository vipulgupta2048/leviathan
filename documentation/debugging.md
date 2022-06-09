# Debugging tests in Leviathan

To improve workflow and write tests faster on Levaithan, the following debug options can be triggered to alter the behavior of test runs. A `debug` object can be added to the `config.js` file right with the existing suite's config. Additionally, the `debug` object can also have custom options as per the need of the test suite. These properties will become available during the test run and can be used to further customize the test run as needed. Example of a debug object:

```js
    debug: {
        failFast: false,
        globalFailFast: false,
        preserveDownloads: false,
        // Custom value 
        CUSTOM_OPTION: 'Verycustomindeed',
    },
```

The supported debug options available are as follows:

1. `failFast`: Exit the ongoing test suite if a test fails. Type: `Boolean`. Value: `true` or `false`. Default: `true`.
2. `preserveDownloads`: Persist downloadeded artifacts. Type: `Boolean`. Value: `true` or `false`. Default: `false`.
3. `globalFailFast`: Exit the ongoing test run if a test fails. Type: `Boolean`. Value: `true` or `false`. No default value.

You can use `this.suite.options` to access the `CUSTOM_OPTION` property in your test suite.

Checkout the [config.example.js](https://github.com/balena-os/leviathan/blob/master/workspace/config.example.js) file for a complete example.