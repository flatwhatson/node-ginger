var uglify = require("uglify-js").uglify,
    parser = require("./parser");

module.exports = Compiler;

function Compiler() {
  this.seq = 0;
}

Compiler.prototype.make_ast = function(input) {
  var self = this;

  var nodes = Array.prototype.concat.apply([], input.map(function(node) { return self.compile_node(node); }).filter(function(node) { return !!node; }));

  return [
    "toplevel",
    Array.prototype.concat.apply([], [
      [["var", [["o", ["string", ""]]]]],
      nodes,
      [["return", ["name", "o"]]]
    ]),
  ];
};

Compiler.prototype.compile = function(input) {
  return uglify.gen_code(this.make_ast(input), {beautify: true, indent_start: 2, indent_level: 2});
};

Compiler.prototype.compile_node = function(node) {
  switch (node.type) {
    case "raw": return this.compile_raw(node);
    case "print": return this.compile_print(node);
    case "for": return this.compile_for(node);
    case "if": return this.compile_if(node);
  }

  console.log("Can't compile node type: " + node.type);
  console.log(node);

  return;
};

Compiler.prototype.compile_raw = function(node) {
  return [[
    "stat",
    [
      "assign",
      "+",
      ["name", "o"],
      ["string", node.data],
    ],
  ]];
};

Compiler.prototype.compile_print = function(node) {
  return [[
    "stat",
    [
      "assign",
      "+",
      ["name","o"],
      this.compile_expression(node.expression),
    ],
  ]];
};

Compiler.prototype.compile_if = function(node) {
  var self = this;

  return [[
    "if",
    this.compile_condition(node.condition),
    ["block", Array.prototype.concat.apply([], node.action.map(function(n) { return self.compile_node(n); }))],
  ]];
};

Compiler.prototype.compile_for = function(node) {
  var self = this;

  var tmp_key_name = "_tmp_key_" + this.seq++,
      tmp_obj_name = "_tmp_obj_" + this.seq++;

  return [
    ["var", [
      [tmp_key_name, ["string", ""]],
      [tmp_obj_name, this.compile_expression(node.config.source)],
    ]],
    [
      "for-in",
      ["name", [tmp_key_name]],
      ["name", [tmp_key_name]],
      ["name", [tmp_obj_name]],
      ["block", [].concat(
        [
          ["stat", [
            "assign",
            true,
            ["name", "ctx"],
            ["call",
              ["dot", ["name", "ctx"], "create_child"],
              [
                ["object", [
                  [node.config.value.name, ["sub", ["name", tmp_obj_name], ["name", tmp_key_name]]],
                  [node.config.key || "key", ["name", tmp_key_name]],
                ]],
              ],
            ],
          ]],
        ],
        Array.prototype.concat.apply([], node.action.map(function(n) { return self.compile_node(n); })),
        [
          ["stat", [
            "assign",
            true,
            ["name", "ctx"],
            ["dot", ["name", "ctx"], "parent"],
          ]],
        ]
      )],
    ],
  ];
};

Compiler.prototype.compile_condition = function(input) {
  if (input.comparison) {
    return ["binary", input.comparison.type, this.compile_expression(input.source), this.compile_expression(input.comparison.expression)];
  } else {
    return this.compile_expression(input.source);
  }

  return ["num", 0];
};

Compiler.prototype.compile_expression = function(input) {
  var self = this;

  var result;
  switch (input.source.type) {
    case "path": { result = self.compile_path(input.source); break; }
    case "string": { result = self.compile_string(input.source); break; }
    case "number": { result = self.compile_number(input.source); break; }
    case "function": { result = self.compile_function(input.source); break; }
  }

  input.filters.forEach(function(f) {
    result = self.compile_function(f, result);
  });

  return result;
};

Compiler.prototype.compile_string = function(input) {
  return ["string", input.data];
};

Compiler.prototype.compile_number = function(input) {
  return ["num", input.data];
};

Compiler.prototype.compile_path = function(input) {
  return [
    "call",
    ["dot", ["name", "ctx"], "get_value"],
    [
      ["array", input.parts.map(function(p) { return ["string", p]; })]
    ],
  ];
};

Compiler.prototype.compile_function = function(input, argument) {
  var self = this;

  return [
    "call",
    ["dot", ["name", "ctx"], "call_function"],
    [
      ["string", input.name.name],
      argument || ["name", "null"],
      ["array", input.arguments.map(function(a) { return self.compile_expression(a); })]
    ],
  ];
};