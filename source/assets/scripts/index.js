/*
 *
 * David Lettier (C) 2013.
 *
 * http://www.lettier.com/
 *
 * JS file for index.html.
 *
 * Renders a 3D Sierpinski gasket using only WebGL.
 * You can subdivide the fractal in real time.
 * Uses per vertex colors and per vertex point cel shaded lighting.
 * Vertex colors are subdivided along with the vertices.
 *
 * Requires: 
 *	- http://glmatrix.net/
 *
 * Special thanks:
 *	- http://learningwebgl.com
 *	- http://www.cs.unm.edu/~angel/BOOK/INTERACTIVE_COMPUTER_GRAPHICS/SIXTH_EDITION/CODE/CHAPTER02/WINDOWS_VERSIONS/example4.cpp
 *
 * Tested with:
 *	- Google Chrome v26.
 *	- Mozilla Firefox v26.
 *
 */
 
// The WebGL context.

var gl;

// Holds the vertex and fragment shaders.

var shaderProgram;

// A stack for preserving matrix transformation states.

var mvMatrixStack = [ ];

// Model view and projection matrices.

var mvMatrix = mat4.create( );
var pMatrix = mat4.create( );

// Sierpinski pyramid data structures for holding the vertices, vertex normals, vertex colors, and vertex indices.

var pyramidVertexPositionBuffer;
var pyramidVertexNormalBuffer;
var pyramidVertexColorBuffer;

// Cube data structures for holding the vertices, vertex normals, vertex colors, and vertex indices.

var cubeVertexPositionBuffer;
var cubeVertexNormalBuffer;
var cubeVertexColorBuffer;
var cubeVertexIndexBuffer;

// Used to for time based animation.

var time_last = 0;

// Used to rotate the pyramids.

var rotation_radians = 0.0;

var rotation_radians_step = 0.17;

// Number of times to subdivide the Sierpinski pyramid.

var subdivide_count = 5;

// Performs the draw loop iteration at roughly 60 frames per second.

window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

// On-load event callback.

window.onload = function ( ) { webGLStart( ); }

// Browser window re-size event callback.

window.onresize = function ( ) { resize_contents( ); }

// Initializes the WebGL context.

function initGL( canvas ) 
{
	
	try 
	{
		
		gl = canvas.getContext( "webgl" ) || canvas.getContext( "experimental-webgl" );
		gl.viewportWidth  = canvas.width;
		gl.viewportHeight = canvas.height;
		
	} 
	catch ( error ) 
	{
		
		// Browser cannot initialize a WebGL context.
		
		window.location.assign( "http://get.webgl.org/" );
		
	}
	
	if ( !gl ) 
	{
		
		// Browser cannot initialize a WebGL context.
		
		window.location.assign( "http://get.webgl.org/" );
		
	}
	
}

// Function to retrieve the shader strings thereby compiling into shader programs run by the GPU.

function getShader( gl, id ) 
{
	var shaderScript = document.getElementById( id );
	
	if ( !shaderScript ) 
	{
		
		console.error( "No shader scripts present." );
		
		return null;
		
	}

	var str = "";
	
	var k = shaderScript.firstChild;
	
	while ( k ) 
	{
		
		if ( k.nodeType == 3 ) 
		{
			
			str += k.textContent;
			
		}
		
		k = k.nextSibling;
		
	}

	var shader;
	
	if ( shaderScript.type == "x-shader/x-fragment" ) 
	{
		
		shader = gl.createShader( gl.FRAGMENT_SHADER );
		
	} 
	else if ( shaderScript.type == "x-shader/x-vertex" ) 
	{
		
		shader = gl.createShader( gl.VERTEX_SHADER );
		
	} 
	else 
	{

		console.error( "No fragment/vertex shaders found." );
		
		return null;
	
	}

	gl.shaderSource(shader, str);
	gl.compileShader(shader);

	if ( !gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) 
	{
	
		console.error( gl.getShaderInfoLog( shader ) );
		
		return null;
	
	}

	return shader;

}

// Initialize the vertex and fragment shaders.

function initShaders( ) 
{
	
	var fragmentShader = getShader( gl, "shader-fs" );
	var vertexShader   = getShader( gl, "shader-vs" );

	shaderProgram = gl.createProgram( );
	gl.attachShader( shaderProgram, vertexShader );
	gl.attachShader( shaderProgram, fragmentShader );
	gl.linkProgram( shaderProgram );

	if ( !gl.getProgramParameter( shaderProgram, gl.LINK_STATUS ) ) 
	{
		
		console.error( "Could not initialize shaders." );
		
	}

	gl.useProgram( shaderProgram );
	
	// Acquire handles to shader program variables in order to pass data to the shaders.

	shaderProgram.vertexPositionAttribute = gl.getAttribLocation( shaderProgram, "aVertexPosition" );
	gl.enableVertexAttribArray( shaderProgram.vertexPositionAttribute );
	
	shaderProgram.vertexColorAttribute = gl.getAttribLocation( shaderProgram, "aVertexColor" );
	gl.enableVertexAttribArray( shaderProgram.vertexColorAttribute );
	
	shaderProgram.vertexNormalAttribute = gl.getAttribLocation( shaderProgram, "aVertexNormal" );
	gl.enableVertexAttribArray( shaderProgram.vertexNormalAttribute );

	shaderProgram.pMatrixUniform = gl.getUniformLocation( shaderProgram, "uPMatrix" );
	shaderProgram.mvMatrixUniform = gl.getUniformLocation( shaderProgram, "uMVMatrix" );
	shaderProgram.nMatrixUniform = gl.getUniformLocation( shaderProgram, "uNMatrix" );
	
	shaderProgram.ambientColorUniform = gl.getUniformLocation( shaderProgram, "uAmbientColor" );
	shaderProgram.pointLightingLocationUniform = gl.getUniformLocation( shaderProgram, "uPointLightingLocation" );
	shaderProgram.pointLightingColorUniform = gl.getUniformLocation( shaderProgram, "uPointLightingColor" );

}

// Initialize all of the vertex, vertex normals, vertex colors, and vertex indice buffers.

function initBuffers( ) 
{
	
	// Create the vertex buffer and bind it getting it ready to read in the vertices to the tetrahedron/pyramid.
	
	pyramidVertexPositionBuffer = gl.createBuffer( );
	gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexPositionBuffer );
	
	// Dimension of the Sierpinski tetrahedron.
	
	var r = 3;
	
	// The main points of the Sierpinski tetrahedron.
	
	var a = 0;
	var b = r;
	var c = b * Math.sqrt( 2 ) * 2.0 / 3.0;
	var d = -1 * b / 3.0;
	var e = -1 * b * Math.sqrt( 2 ) / 3.0;
	var f = b * Math.sqrt( 2 ) / Math.sqrt( 3 );
	var g = -1 * f;
	
	var point_one   = [ a, b, a ];
	var point_two   = [ c, d, a ];
	var point_three = [ e, d, f ];
	var point_four  = [ e, d, g ];
	
	// Vertex colors of the four main points of the Sierpinski tetrahedron/pyramid.
	
	var color_one   = [ 0.8, 0.2, 0.2 ];
	var color_two   = [ 0.2, 0.4, 0.9 ];
	var color_three = [ 1.0, 0.8, 0.2 ];
	var color_four  = [ 0.3, 0.8, 0.3 ];
	
	// Temporary arrays to hold all of the data that will be read into the buffers.
	
	var vertices       = [ ];
	var vertex_normals = [ ];
	var vertex_colors  = [ ];
	
	// Finds the midpoint between two points which form an edge of the tetrahedron.
	
	function midpoint( one, two )
	{
	
		var point = [ ( one[ 0 ] + two[ 0 ] ) / 2.0, ( one[ 1 ] + two[ 1 ] ) / 2.0, ( one[ 2 ] + two[ 2 ] ) / 2.0  ];
		
		return point;
		
	}
	
	// Generates one triangle face to the tetrahedron
	
	function triangle( p1, p2, p3, c1, c2, c3 )
	{
	
		function random_float( from, to )
		{
		
			return from + ( to - from ) * Math.random( );
			
		}
		
		// Push the vertices to this triangle face.
		
		vertices.push( p1[ 0 ] ); vertices.push( p1[ 1 ] ); vertices.push( p1[ 2 ] );
		vertices.push( p2[ 0 ] ); vertices.push( p2[ 1 ] ); vertices.push( p2[ 2 ] );
		vertices.push( p3[ 0 ] ); vertices.push( p3[ 1 ] ); vertices.push( p3[ 2 ] );
		
		// Push the vertex colors for this triangle face.
		
		vertex_colors.push( c1[ 0 ] ); vertex_colors.push( c1[ 1 ] ); vertex_colors.push( c1[ 2 ] ); vertex_colors.push( 1.0 );
		vertex_colors.push( c2[ 0 ] ); vertex_colors.push( c2[ 1 ] ); vertex_colors.push( c2[ 2 ] ); vertex_colors.push( 1.0 );
		vertex_colors.push( c3[ 0 ] ); vertex_colors.push( c3[ 1 ] ); vertex_colors.push( c3[ 2 ] ); vertex_colors.push( 1.0 );
		
		// Compute this triangle face's face normal for use in the lighting calculations.
		
		var triangle_side_u = [ p2[ 0 ] - p1[ 0 ], p2[ 1 ] - p1[ 1 ], p2[ 2 ] - p1[ 2 ] ];
		var triangle_side_v = [ p3[ 0 ] - p1[ 0 ], p3[ 1 ] - p1[ 1 ], p3[ 2 ] - p1[ 2 ] ]; 
		
		var face_normal_x = ( triangle_side_u[ 1 ] * triangle_side_v[ 2 ] ) - ( triangle_side_u[ 2 ] * triangle_side_v[ 1 ] );
		var face_normal_y = ( triangle_side_u[ 2 ] * triangle_side_v[ 0 ] ) - ( triangle_side_u[ 0 ] * triangle_side_v[ 2 ] );
		var face_normal_z = ( triangle_side_u[ 0 ] * triangle_side_v[ 1 ] ) - ( triangle_side_u[ 1 ] * triangle_side_v[ 0 ] );
		
		var length = Math.sqrt( ( face_normal_x * face_normal_x ) + ( face_normal_y * face_normal_y ) + ( face_normal_z * face_normal_z ) );
		
		// Normalize this face normal.
		
		face_normal_x = face_normal_x / length;
		face_normal_y = face_normal_y / length;
		face_normal_z = face_normal_z / length;
		
		// Use the face normal of this triangle face as the vertex normal for all of the vertex normals that make up this triangle face. These vertex normals will be used in the lighting calculations.
		// Instead, to compute the vertex normals, you could average all of the face normals that are adjacent to a particular vertex as the vertex normal.
		
		vertex_normals.push( -face_normal_x ); vertex_normals.push( -face_normal_y ); vertex_normals.push( -face_normal_z );
		vertex_normals.push( -face_normal_x ); vertex_normals.push( -face_normal_y ); vertex_normals.push( -face_normal_z );
		vertex_normals.push( -face_normal_x ); vertex_normals.push( -face_normal_y ); vertex_normals.push( -face_normal_z );
		
		// Return the face normal to later compute the average of all the face normals that are adjacent to a particular vertex.
		
		return [ -face_normal_x, -face_normal_y, -face_normal_z ];
	
	}
	
	function vertex_normal( v, fN1, fN2, fN3 )
	{
	
		// Sum all of the face normals adjacent to this vertex component wise.
		
		var face_normal_sum = [ fN1[ 0 ] + fN2[ 0 ] + fN3[ 0 ], fN1[ 1 ] + fN2[ 1 ] + fN3[ 1 ], fN1[ 2 ] + fN2[ 2 ] + fN3[ 2 ] ];
		
		// Compute the average.
		
		var face_normal_average = [ face_normal_sum[ 0 ] / 3.0, face_normal_sum[ 1 ] / 3.0, face_normal_sum[ 2 ] / 3.0 ]; 
		
		// Normalize the average.
		
		var length = Math.sqrt( ( face_normal_average[ 0 ] * face_normal_average[ 0 ] ) + ( face_normal_average[ 1 ] * face_normal_average[ 1 ] ) + ( face_normal_average[ 2 ] * face_normal_average[ 2 ] ) );
		
		face_normal_average[ 0 ] =  face_normal_average[ 0 ] / length;
		face_normal_average[ 1 ] =  face_normal_average[ 1 ] / length;
		face_normal_average[ 2 ] =  face_normal_average[ 2 ] / length;
		
		// This vertex normal is the normalized average of all the face normals that are adjacent to this vertex.
		
		vertex_normals.push( face_normal_average[ 0 ] ); vertex_normals.push( face_normal_average[ 1 ] ); vertex_normals.push( face_normal_average[ 2 ] );
	
	}	
	
	function tetrahedron( p1, p2, p3, p4, c1, c2, c3, c4 )
	{
	
		var fN1 = triangle( p1, p2, p3, c1, c2, c3 ); // Front face.
		var fN2 = triangle( p1, p4, p2, c1, c2, c4 ); // Right face.
		var fN3 = triangle( p1, p3, p4, c1, c3, c4 ); // Left face.
		var fN4 = triangle( p2, p4, p3, c2, c3, c4 ); // Bottom face.
		
		// Compute and add the vertex normals using the face normals returned.
		// These vertex normals will be used for the lighting calculations.
		
		/*
		
		vertex_normal( p1, fN1, fN2, fN3 );
		vertex_normal( p2, fN1, fN4, fN2 );
		vertex_normal( p3, fN1, fN3, fN4 );
		
		vertex_normal( p1, fN1, fN2, fN3 );
		vertex_normal( p4, fN2, fN4, fN3 );
		vertex_normal( p2, fN1, fN4, fN2 );
		
		vertex_normal( p1, fN1, fN2, fN3 );
		vertex_normal( p3, fN1, fN3, fN4 );
		vertex_normal( p4, fN2, fN4, fN3 );
		
		vertex_normal( p2, fN1, fN4, fN2 );
		vertex_normal( p4, fN2, fN4, fN3 );
		vertex_normal( p3, fN1, fN3, fN4 );
		
		*/
		
	}
		
	
	function divide_tetrahedron( p1, p2, p3, p4, c1, c2, c3, c4, count )
	{
	
		// If the subdivision count is greater than zero.
		
		if ( count > 0 )
		{
		
			// Find the midpoints to all of the edges of this pyramid/tetrahedron.
			
			var p1_p2 = midpoint( p1, p2 );
			var p1_p3 = midpoint( p1, p3 );
			var p1_p4 = midpoint( p1, p4 );
			var p2_p3 = midpoint( p2, p3 );
			var p2_p4 = midpoint( p2, p4 );
			var p3_p4 = midpoint( p3, p4 );
			
			// Subdivide the vertex colors as well--similar to subdividing the edges.
			
			var c1_c2 = midpoint( c1, c2 );
			var c1_c3 = midpoint( c1, c3 );
			var c1_c4 = midpoint( c1, c4 );
			var c2_c3 = midpoint( c2, c3 );
			var c2_c4 = midpoint( c2, c4 );
			var c3_c4 = midpoint( c3, c4 );
			
			// Each subdivision of a tetrahedron/pyramid produces four new pyramids from the subdivided pyramid.
			// One on top and three on the bottom.
			
			// Four recursive calls.
			
			divide_tetrahedron( p1,    p1_p2, p1_p3, p1_p4, c1,    c1_c2, c1_c3, c1_c4, count - 1 );
			divide_tetrahedron( p1_p2, p2,    p2_p3, p2_p4, c1_c2, c2,    c2_c3, c2_c4, count - 1 );
			divide_tetrahedron( p1_p3, p2_p3, p3,    p3_p4, c1_c3, c2_c3, c3,    c3_c4, count - 1 );
			divide_tetrahedron( p1_p4, p2_p4, p3_p4, p4,    c1_c4, c2_c4, c3_c4, c4,    count - 1 );
		
		}
		else
		{
			
			// No more subdivision, so assemble this tetrahedron/pyramid.
			// The recursive base case.
			
			tetrahedron( p1, p2, p3, p4, c1, c2, c3, c4 );
			
		}
		
	}
	
	// Begin creating the Sierpinski pyramid.

	divide_tetrahedron( point_one, point_two, point_three, point_four, color_one, color_two, color_three, color_four, subdivide_count );
	
	// Bind and fill the pyramid vertices.
	
	gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertices ), gl.STATIC_DRAW );
	pyramidVertexPositionBuffer.itemSize = 3;
	pyramidVertexPositionBuffer.numItems = vertices.length / 3;
	
	// Bind and fill the pyramid vertex normals.
	
	pyramidVertexNormalBuffer = gl.createBuffer( );
	gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexNormalBuffer );
	
	gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertex_normals ), gl.STATIC_DRAW );
	pyramidVertexNormalBuffer.itemSize = 3;
	pyramidVertexNormalBuffer.numItems = vertex_normals.length / 3;
	
	// Bind and fill the pyramid vertex colors.
	
	pyramidVertexColorBuffer = gl.createBuffer( );
	gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexColorBuffer );
	
	gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertex_colors ), gl.STATIC_DRAW );
	pyramidVertexColorBuffer.itemSize = 4;
	pyramidVertexColorBuffer.numItems = vertex_colors.length / 4;
	
	// Begin creating the cube. 
	// This cube gives a visual representation to the unseen point light in the rendering.
	
	cubeVertexPositionBuffer = gl.createBuffer( );
	gl.bindBuffer( gl.ARRAY_BUFFER, cubeVertexPositionBuffer );
	
	vertices = [ 
	
		// Front face.
		-1.0, -1.0,  1.0,
		 1.0, -1.0,  1.0,
		 1.0,  1.0,  1.0,
		-1.0,  1.0,  1.0,

		// Back face.
		-1.0, -1.0, -1.0,
		-1.0,  1.0, -1.0,
		 1.0,  1.0, -1.0,
		 1.0, -1.0, -1.0,

		// Top face.
		-1.0,  1.0, -1.0,
		-1.0,  1.0,  1.0,
		 1.0,  1.0,  1.0,
		 1.0,  1.0, -1.0,

		// Bottom face.
		-1.0, -1.0, -1.0,
		 1.0, -1.0, -1.0,
		 1.0, -1.0,  1.0,
		-1.0, -1.0,  1.0,

		// Right face.
		 1.0, -1.0, -1.0,
		 1.0,  1.0, -1.0,
		 1.0,  1.0,  1.0,
		 1.0, -1.0,  1.0,

		// Left face.
		-1.0, -1.0, -1.0,
		-1.0, -1.0,  1.0,
		-1.0,  1.0,  1.0,
		-1.0,  1.0, -1.0,
		
	];
	
	vertex_colors = [
	
		// Front face.
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		
		// Back face.
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		
		// Top face.
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		
		// Bottom face.
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		
		// Right face.
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		
		// Left face.
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		1.0, 1.0, 1.0, 1.0,
		
	];
	
	vertex_normals = [
	
		// Front face.
		0.0,  0.0,  1.0,
		0.0,  0.0,  1.0,
		0.0,  0.0,  1.0,
		0.0,  0.0,  1.0,

		// Back face.
		0.0,  0.0, -1.0,
		0.0,  0.0, -1.0,
		0.0,  0.0, -1.0,
		0.0,  0.0, -1.0,

		// Top face.
		0.0,  1.0,  0.0,
		0.0,  1.0,  0.0,
		0.0,  1.0,  0.0,
		0.0,  1.0,  0.0,

		// Bottom face.
		0.0, -1.0,  0.0,
		0.0, -1.0,  0.0,
		0.0, -1.0,  0.0,
		0.0, -1.0,  0.0,

		// Right face.
		1.0,  0.0,  0.0,
		1.0,  0.0,  0.0,
		1.0,  0.0,  0.0,
		1.0,  0.0,  0.0,

		// Left face.
		-1.0,  0.0,  0.0,
		-1.0,  0.0,  0.0,
		-1.0,  0.0,  0.0,
		-1.0,  0.0,  0.0,
		 
	];
	
	var vertex_indices = [
		
		0,   1,  2,    0,  2,  3, // Front face.
		4,   5,  6,    4,  6,  7, // Back face.
		8,   9, 10,    8, 10, 11, // Top face.
		12, 13, 14,   12, 14, 15, // Bottom face.
		16, 17, 18,   16, 18, 19, // Right face.
		20, 21, 22,   20, 22, 23  // Left face.
		
	];
	
	// Bind and fill the cube's buffers.
	
	gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertices ), gl.STATIC_DRAW );
	cubeVertexPositionBuffer.itemSize = 3;
	cubeVertexPositionBuffer.numItems = vertices.length / 3;
	
	cubeVertexNormalBuffer = gl.createBuffer( );
	gl.bindBuffer( gl.ARRAY_BUFFER, cubeVertexNormalBuffer );
	
	gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertex_normals ), gl.STATIC_DRAW );
	cubeVertexNormalBuffer.itemSize = 3;
	cubeVertexNormalBuffer.numItems = vertex_normals.length / 3;
	
	cubeVertexColorBuffer = gl.createBuffer( );
	gl.bindBuffer( gl.ARRAY_BUFFER, cubeVertexColorBuffer );
	
	gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertex_colors ), gl.STATIC_DRAW );
	cubeVertexColorBuffer.itemSize = 4;
	cubeVertexColorBuffer.numItems = vertex_colors.length / 4;
	
	cubeVertexIndexBuffer = gl.createBuffer();
	gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer );

	gl.bufferData( gl.ELEMENT_ARRAY_BUFFER, new Uint16Array( vertex_indices ), gl.STATIC_DRAW );
	cubeVertexIndexBuffer.itemSize = 1;
	cubeVertexIndexBuffer.numItems = vertex_indices.length;

}

function initControls( )
{

	// Create and show the onscreen subdivision controls.
	
	var subdivision_text_box       = document.createElement( "div" );
	subdivision_text_box.id        = "subdivision_text_box";
	subdivision_text_box.className = "subdivision_text_box";
	subdivision_text_box.innerHTML = "Subdivision: " + subdivide_count;
	document.body.appendChild( subdivision_text_box );
	
	var up_button       = document.createElement( "div" );
	up_button.id        = "up_button";
	up_button.title     = "Increase";
	up_button.className = "up_button";
	up_button.innerHTML = "&#8593;";
	
	// Button click callback.
	
	up_button.onclick = function ( ) 
	{
		
		if ( subdivide_count === 7 ) 
		{ 
		
			subdivide_count = 7;
		 
		}
		else
		{
		
			subdivide_count += 1;
			
			document.getElementById( "subdivision_text_box" ).innerHTML = "Subdivision: " + subdivide_count;
			
			initBuffers( );
		
		}
		
	};
	
	document.body.appendChild( up_button );
	
	var down_button       = document.createElement( "div" );
	down_button.id        = "down_button";
	down_button.title     = "Decrease";
	down_button.className = "down_button";
	down_button.innerHTML = "&#8595;";
	
	// Button click callback.
	
	down_button.onclick = function ( ) 
	{

		if ( subdivide_count === 0 ) 
		{ 
		
			subdivide_count = 0; 
			
		}
		else
		{
		
			subdivide_count -= 1;
		
			document.getElementById( "subdivision_text_box" ).innerHTML = "Subdivision: " + subdivide_count;
		
			initBuffers( );
			
		}
		
	};
	
	document.body.appendChild( down_button );
	
}

function initHUD( )
{

	// Create and show an onscreen logo.
	
	var logo_box        = document.createElement( "div" );
	logo_box.id         = "logo_box";
	logo_box.title      = "Lettier";
	logo_box.className  = "logo_box";
	logo_box.innerHTML  = "<a href=\"http://www.lettier.com/\"><img id=\"logo\" src=\"assets/images/logo.png\" class=\"logo\"></a>";
	document.body.appendChild( logo_box );
	
	var logo_image      = document.getElementById( "logo" );
	logo_image_height   = logo_image.clientHeight * 0.4;
	logo_image_width    = logo_image.clientHeight * 0.4;
	logo_image.style.height = logo_image_height + "px";
	logo_image.style.width  = logo_image_width  + "px";
	logo_box.style.top  = window.innerHeight - logo_image_height - 10 + "px";
	logo_box.style.left = window.innerWidth  - logo_image_width  - 10 + "px";
	
}

// Pass to the vertex shader the needed matrices.

function setMatrixUniforms( ) 
{
	
	// Pass the vertex shader the projection matrix and the model-view matrix.
	
	gl.uniformMatrix4fv( shaderProgram.pMatrixUniform,  false, pMatrix );
	gl.uniformMatrix4fv( shaderProgram.mvMatrixUniform, false, mvMatrix );
	
	// Pass the vertex normal matrix to the shader so it can compute the lighting calculations.
	
	var normalMatrix = mat3.create( );
	mat3.normalFromMat4( normalMatrix, mvMatrix ) 
	gl.uniformMatrix3fv( shaderProgram.nMatrixUniform, false, normalMatrix );
	
}

function mvPushMatrix( ) 
{
	
	// Save the model-view matrix for later use.
	
	var copy = mat4.create( );
	copy = mat4.copy( copy, mvMatrix );
	mvMatrixStack.push( copy );
	
}

function mvPopMatrix( ) 
{
	
	// Gather the previously pushed model-view matrix.
	
	if ( mvMatrixStack.length === 0 ) 
	{
		
		console.error( "mvMatrixStack empty." );
		
	}
	
	mvMatrix = mvMatrixStack.pop( );
}

// The function renders the Sierpinski pyramid and the cube onscreen all lit with the point light.
// It also animates the rotation of the Sierpinski pyramids.

function drawScene( timestamp ) 
{
	
	// Call this function to draw the next frame.
	
	window.requestAnimationFrame( drawScene );
	
	// Time based animation instead of frame based animation.
	
	var time_now = new Date( ).getTime( );
	
	if ( time_last != 0 ) 
	{
		
		var time_delta = ( time_now - time_last ) / 1000.0; 

		rotation_radians += rotation_radians_step * time_delta;
		
		if ( rotation_radians > ( Math.PI * 2 ) ) rotation_radians = 0.0;

	}
	
	time_last = time_now;
	
	// Set the size of and clear the render window.
	
	gl.viewport( 0, 0, gl.viewportWidth, gl.viewportHeight );
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	
	// Create the perspective matrix.

	mat4.perspective( pMatrix, 45, gl.viewportWidth / gl.viewportHeight, 0.1, 500.0 );
	
	// Pass the lighting parameters to the vertex and fragment shader.
	
	gl.uniform3f( shaderProgram.ambientColorUniform, 0.5, 0.5, 0.5 );
	gl.uniform3f( shaderProgram.pointLightingLocationUniform, 3.0, 0.0, -7.0 );
	gl.uniform3f( shaderProgram.pointLightingColorUniform, 0.8, 0.8, 0.8 );
	
	// Move to the 3D space origin.
	// Then move down the negative x-axis and down the negative z-axis.

	mat4.identity( mvMatrix );
	mat4.translate( mvMatrix, mvMatrix, [ -0.5, 0.0, -7.0 ] );
	
	// Save the current model-view matrix for later use.
	
	mvPushMatrix( );
	
	// Rotate the model-view matrix thereby rotating the Sierpinski pyramid.
	
	mat4.rotate( mvMatrix, mvMatrix,  rotation_radians, [ 0, 1, 0 ] );
	mat4.rotate( mvMatrix, mvMatrix, -rotation_radians, [ 0, 0, 1 ] );
	mat4.rotate( mvMatrix, mvMatrix,  rotation_radians, [ 1, 0, 0 ] );
	
	// Pass to the vertex shader the pyramid data.
	
	gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexPositionBuffer );
	gl.vertexAttribPointer( shaderProgram.vertexPositionAttribute, pyramidVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
	gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexNormalBuffer );
	gl.vertexAttribPointer( shaderProgram.vertexNormalAttribute, pyramidVertexNormalBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
	gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexColorBuffer );
	gl.vertexAttribPointer( shaderProgram.vertexColorAttribute, pyramidVertexColorBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
	setMatrixUniforms( );
	
	// Render the pyramid to the screen.
	
	gl.drawArrays( gl.TRIANGLES, 0, pyramidVertexPositionBuffer.numItems );
	
	// Get back the old model-view matrix.
	
	mvPopMatrix( );
	
	// Second pyramid.
	
	if ( subdivide_count != 0 )
	{
	
		mvPushMatrix( );
	
		mat4.scale(  mvMatrix, mvMatrix, [ 0.3, 0.3, 0.3 ] );
	
		mat4.rotate( mvMatrix, mvMatrix, Math.PI, [ 0, 0, 1 ] );
	
		mat4.rotate( mvMatrix, mvMatrix, -rotation_radians, [ 0, 1, 0 ] );
		mat4.rotate( mvMatrix, mvMatrix,  rotation_radians, [ 0, 0, 1 ] );
		mat4.rotate( mvMatrix, mvMatrix, -rotation_radians, [ 1, 0, 0 ] );
	
		gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexPositionBuffer );
		gl.vertexAttribPointer( shaderProgram.vertexPositionAttribute, pyramidVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
		gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexNormalBuffer );
		gl.vertexAttribPointer( shaderProgram.vertexNormalAttribute, pyramidVertexNormalBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
		gl.bindBuffer( gl.ARRAY_BUFFER, pyramidVertexColorBuffer );
		gl.vertexAttribPointer( shaderProgram.vertexColorAttribute, pyramidVertexColorBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
		setMatrixUniforms( );
	
		gl.drawArrays( gl.TRIANGLES, 0, pyramidVertexPositionBuffer.numItems );
	
		mvPopMatrix( );
	
	}
	
	// Move to where we want to place the cube in 3D space, scale the cube, rotate the cube, pass to the shader the cube's buffer data, and then render the cube to the screen.
	
	mat4.translate( mvMatrix, mvMatrix, [ 4.0, 0.0, 0.0 ] );
	
	mvPushMatrix( );
	
	mat4.scale(  mvMatrix, mvMatrix, [ 0.2, 0.2, 0.2 ] );
	mat4.rotate( mvMatrix, mvMatrix, Math.PI / 4.0, [ 1, 0, 0 ] );
	
	gl.bindBuffer( gl.ARRAY_BUFFER, cubeVertexPositionBuffer );
	gl.vertexAttribPointer( shaderProgram.vertexPositionAttribute, cubeVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
	gl.bindBuffer( gl.ARRAY_BUFFER, cubeVertexNormalBuffer );
	gl.vertexAttribPointer( shaderProgram.vertexNormalAttribute, cubeVertexNormalBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
	gl.bindBuffer( gl.ARRAY_BUFFER, cubeVertexColorBuffer );
	gl.vertexAttribPointer( shaderProgram.vertexColorAttribute, cubeVertexColorBuffer.itemSize, gl.FLOAT, false, 0, 0 );
	
	gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer );
	
	setMatrixUniforms( );
	
	gl.drawElements( gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0 );
	
	mvPopMatrix( );
	
}

function resize_contents( )
{

	// The browser window has been re-sized so re-size the render window and onscreen elements.

	var logo_image      = document.getElementById( "logo" );
	logo_image_height   = logo_image.clientHeight;
	logo_image_width    = logo_image.clientHeight;
	logo_box.style.top  = window.innerHeight - logo_image_height - 10 + "px";
	logo_box.style.left = window.innerWidth  - logo_image_width  - 10 + "px";
	
	var canvas    = document.getElementById( "webgl_canvas" );
	canvas.width  = window.innerWidth;
	canvas.height = window.innerHeight;
	
	gl.viewportWidth  = canvas.width;
	gl.viewportHeight = canvas.height;
	
}

function webGLStart( ) 
{
	
	// Create and add the canvas that will be "painted" on or rather rendered to by WebGL.
	
	var canvas    = document.createElement( "canvas" );
	canvas.id     = "webgl_canvas";
	canvas.width  = window.innerWidth;
	canvas.height = window.innerHeight;
	document.body.appendChild( canvas );
	
	// Vertex shader GLSL code.
	
	var vertex_shader = document.createElement( "script" );
	vertex_shader.id = "shader-vs";
	vertex_shader.type = "x-shader/x-vertex";
	vertex_shader.innerHTML   = "attribute vec3 aVertexPosition;";
	vertex_shader.innerHTML  += "attribute vec3 aVertexNormal;";
	vertex_shader.innerHTML  += "attribute vec4 aVertexColor;";
	vertex_shader.innerHTML  += "uniform mat4 uMVMatrix;";
	vertex_shader.innerHTML  += "uniform mat4 uPMatrix;";
	vertex_shader.innerHTML  += "uniform mat3 uNMatrix;";
	vertex_shader.innerHTML  += "uniform vec3 uAmbientColor;";
	vertex_shader.innerHTML  += "varying vec4 vColor;";
	vertex_shader.innerHTML  += "varying vec3 vLightWeighting;";
	vertex_shader.innerHTML  += "uniform vec3 uPointLightingLocation;";
	vertex_shader.innerHTML  += "uniform vec3 uPointLightingColor;";
	vertex_shader.innerHTML  += "varying vec3 lightDirection;";
	vertex_shader.innerHTML  += "varying vec3 transformedNormal;";
	vertex_shader.innerHTML  += "void main( void ) {";
	vertex_shader.innerHTML  += "vec4 mvPosition = uMVMatrix * vec4( aVertexPosition, 1.0 );";
	vertex_shader.innerHTML  += "gl_Position = uPMatrix * mvPosition;"; // The vertex's final position.
	vertex_shader.innerHTML  += "vColor = aVertexColor;";
	vertex_shader.innerHTML  += "lightDirection = normalize( uPointLightingLocation - mvPosition.xyz );"; // Point lighting.
	vertex_shader.innerHTML  += "transformedNormal = uNMatrix * aVertexNormal;"; // Point lighting.
	vertex_shader.innerHTML  += "float directionalLightWeighting = max( dot( transformedNormal, lightDirection ), 0.0 );"; // Point lighting.
	vertex_shader.innerHTML  += "vLightWeighting = uAmbientColor + ( uPointLightingColor * directionalLightWeighting );"; // Point lighting.
	vertex_shader.innerHTML  += "}";
	document.body.appendChild( vertex_shader );
	
	// Fragment shader GLSL code.
	
	var fragment_shader = document.createElement( "script" );
	fragment_shader.id = "shader-fs";
	fragment_shader.type = "x-shader/x-fragment";
	fragment_shader.innerHTML   = "precision mediump float;";
	fragment_shader.innerHTML  += "varying vec3 vLightWeighting;";
	fragment_shader.innerHTML  += "varying vec4 vColor;";
	fragment_shader.innerHTML  += "varying vec3 lightDirection;";
	fragment_shader.innerHTML  += "varying vec3 transformedNormal;";
	fragment_shader.innerHTML  += "void main( void ) {";
	fragment_shader.innerHTML  += "float intensity;"; // Cel-shading.
	fragment_shader.innerHTML  += "intensity = dot( lightDirection, normalize( transformedNormal ) );"; // Cel-shading.
	fragment_shader.innerHTML  += "vec4 vColorIntensity;"; // Cel-shading.
	fragment_shader.innerHTML  += "vec4 finalColor;"; // Cel-shading.
	fragment_shader.innerHTML  += "if ( intensity > 0.8 )"; // Cel-shading.
	fragment_shader.innerHTML  += "	vColorIntensity = vec4( 0.7, 0.7, 0.7, 1.0 );"; // Cel-shading.
	fragment_shader.innerHTML  += "else if ( intensity > 0.5 )"; // Cel-shading.
	fragment_shader.innerHTML  += "	vColorIntensity = vec4( 0.5, 0.5, 0.5, 1.0 );"; // Cel-shading.
	fragment_shader.innerHTML  += "else if ( intensity > 0.2 )"; // Cel-shading.
	fragment_shader.innerHTML  += "	vColorIntensity = vec4( 0.3, 0.3, 0.3, 1.0 );"; // Cel-shading.
	fragment_shader.innerHTML  += "else"; // Cel-shading.
	fragment_shader.innerHTML  += "	vColorIntensity = vec4( 0.2, 0.2, 0.2, 1.0 );"; // Cel-shading.
	fragment_shader.innerHTML  += "finalColor = vColorIntensity * vec4( vColor.rgb * vLightWeighting, vColor.a );"; // Cel-shading.
	fragment_shader.innerHTML  += "const float LOG2 = 1.442695;"; // Fog.
	fragment_shader.innerHTML  += "float z = gl_FragCoord.z / gl_FragCoord.w;"; // Fog.
	fragment_shader.innerHTML  += "if ( z >= 5.0 )"; // Fog.
	fragment_shader.innerHTML  += "{";
	fragment_shader.innerHTML  += "	vec4 fogColor = vec4( 0.1, 0.1, 0.1, 1.0 );"; // Fog.
//	fragment_shader.innerHTML  += "	float fogFactor = ( 8.3 - z ) / ( 8.3 - 6.5 );"; // Fog.
	fragment_shader.innerHTML  += "	float fogFactor = exp( -0.6 * 0.6 * ( 0.7 * z - 3.5 ) * ( 0.7 * z - 3.5 ) );"; // Fog.
	fragment_shader.innerHTML  += "	fogFactor = clamp( fogFactor, 0.0, 1.0 );"; // Fog.
	fragment_shader.innerHTML  += "	gl_FragColor = mix( fogColor, finalColor, fogFactor );"; // Fog with final fragment/pixel color.
	fragment_shader.innerHTML  += "}"; // Fog.
	fragment_shader.innerHTML  += "else";
	fragment_shader.innerHTML  += "	gl_FragColor = finalColor;"; // The fragment's/pixel's final color.
	fragment_shader.innerHTML  += "}";
	document.body.appendChild( fragment_shader );
	
	initGL( canvas ); // Initialize WebGL.
	initShaders( );   // Initialize the shaders.
	initBuffers( );   // Initialize the 3D shapes.
	initHUD( );       // Initialize the onscreen elements.
	initControls( );  // Initialize the onscreen controls.

	gl.clearColor( 0.1, 0.1, 0.1, 1.0 ); // Set the WebGL background color.
	gl.enable( gl.DEPTH_TEST ); // Enable the depth buffer.

	window.requestAnimationFrame( drawScene ); // Begin rendering animation.
	
}
